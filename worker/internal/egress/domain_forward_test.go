package egress

import (
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"testing"
	"time"

	"golang.org/x/net/dns/dnsmessage"
)

func TestDomainAssociationRewritesOnlyAUniqueName(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	var table domainTable
	table.observe(dnsA(t, "api.example.test.", 30, net.IPv4(192, 0, 2, 123)), now)
	got, err := table.rewrite("192.0.2.123:443", now)
	if err != nil || got != "api.example.test:443" {
		t.Fatalf("unique got %q err %v", got, err)
	}
	literal, err := table.rewrite("192.0.2.9:443", now)
	if err != nil || literal != "192.0.2.9:443" {
		t.Fatalf("unmapped got %q err %v", literal, err)
	}
	table.observe(dnsA(t, "cdn.example.test.", 30, net.IPv4(192, 0, 2, 123)), now)
	if _, err = table.rewrite("192.0.2.123:443", now); err == nil {
		t.Fatal("shared address was rewritten")
	}
	if _, err = table.rewrite("192.0.2.123:443", now.Add(time.Hour)); err != nil {
		t.Fatalf("expired association still blocked: %v", err)
	}
}

func TestDomainAssociationFollowsCNAME(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	qname := dnsmessage.MustNewName("api.example.test.")
	target := dnsmessage.MustNewName("edge.example.test.")
	msg := dnsmessage.Message{
		Header:    dnsmessage.Header{Response: true, RCode: dnsmessage.RCodeSuccess},
		Questions: []dnsmessage.Question{{Name: qname, Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET}},
		Answers: []dnsmessage.Resource{
			{
				Header: dnsmessage.ResourceHeader{Name: qname, Type: dnsmessage.TypeCNAME, Class: dnsmessage.ClassINET, TTL: 30},
				Body:   &dnsmessage.CNAMEResource{CNAME: target},
			},
			{
				Header: dnsmessage.ResourceHeader{Name: target, Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET, TTL: 30},
				Body:   &dnsmessage.AResource{A: [4]byte{192, 0, 2, 10}},
			},
		},
	}
	packed, err := msg.Pack()
	if err != nil {
		t.Fatal(err)
	}
	var table domainTable
	table.observe(packed, now)
	got, err := table.rewrite("192.0.2.10:443", now)
	if err != nil || got != "api.example.test:443" {
		t.Fatalf("cname got %q err %v", got, err)
	}
}

func TestForwardTCPUsesHostnameOnlyWhenDomainForwardIsOn(t *testing.T) {
	echo := serveEcho(t)
	defer echo.Close()
	got := make(chan socksSeen, 1)
	socks := serveCapturingSOCKS(t, got, echo.Addr().String())
	defer socks.Close()

	now := time.Now()
	on, err := New(Config{ProxyURL: "socks5h://" + socks.Addr().String(), ListenTCP: "127.0.0.1:0", DomainForward: true})
	if err != nil {
		t.Fatal(err)
	}
	on.domains.observe(dnsA(t, "api.example.test.", 60, net.IPv4(192, 0, 2, 123)), now)
	client, peer := net.Pipe()
	defer client.Close()
	errCh := make(chan error, 1)
	go func() { errCh <- on.ForwardTCP(context.Background(), peer, "192.0.2.123:443") }()
	if _, err = client.Write([]byte("ping")); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 4)
	_ = client.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err = io.ReadFull(client, buf); err != nil {
		t.Fatal(err)
	}
	select {
	case item := <-got:
		if item.atyp != 3 || item.host != "api.example.test" {
			t.Fatalf("connect %#v", item)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("socks connect missing")
	}
	_ = client.Close()

	off, err := New(Config{ProxyURL: "socks5h://127.0.0.1:1", ListenTCP: "127.0.0.1:0"})
	if err != nil {
		t.Fatal(err)
	}
	off.domains.observe(dnsA(t, "api.example.test.", 60, net.IPv4(192, 0, 2, 50)), now)
	dest, err := off.dialDest("192.0.2.50:443")
	if err != nil || dest != "192.0.2.50:443" {
		t.Fatalf("flag off dialed %q err %v", dest, err)
	}

	ambiguous, err := New(Config{ProxyURL: "socks5h://127.0.0.1:1", ListenTCP: "127.0.0.1:0", DomainForward: true})
	if err != nil {
		t.Fatal(err)
	}
	ambiguous.domains.observe(dnsA(t, "one.example.test.", 60, net.IPv4(192, 0, 2, 77)), now)
	ambiguous.domains.observe(dnsA(t, "two.example.test.", 60, net.IPv4(192, 0, 2, 77)), now)
	left, right := net.Pipe()
	defer left.Close()
	err = ambiguous.ForwardTCP(context.Background(), right, "192.0.2.77:443")
	var splice *spliceError
	if !errors.As(err, &splice) || splice.class != classAmbiguousDomain {
		t.Fatalf("ambiguous err %v", err)
	}
}

func dnsA(t *testing.T, qname string, ttl uint32, ip net.IP) []byte {
	t.Helper()
	name := dnsmessage.MustNewName(qname)
	v4 := ip.To4()
	if v4 == nil {
		t.Fatalf("need ipv4 %s", ip)
	}
	msg := dnsmessage.Message{
		Header:    dnsmessage.Header{Response: true, RCode: dnsmessage.RCodeSuccess},
		Questions: []dnsmessage.Question{{Name: name, Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET}},
		Answers: []dnsmessage.Resource{{
			Header: dnsmessage.ResourceHeader{Name: name, Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET, TTL: ttl},
			Body:   &dnsmessage.AResource{A: [4]byte{v4[0], v4[1], v4[2], v4[3]}},
		}},
	}
	packed, err := msg.Pack()
	if err != nil {
		t.Fatal(err)
	}
	return packed
}

type socksSeen struct {
	atyp byte
	host string
}

func serveEcho(t *testing.T) net.Listener {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				buf := make([]byte, 4)
				_, _ = io.ReadFull(c, buf)
				_, _ = c.Write(buf)
			}()
		}
	}()
	return ln
}

func serveCapturingSOCKS(t *testing.T, got chan<- socksSeen, upstream string) net.Listener {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		head := make([]byte, 2)
		if _, err = io.ReadFull(c, head); err != nil {
			return
		}
		if head[1] > 0 {
			_, _ = io.ReadFull(c, make([]byte, head[1]))
		}
		_, _ = c.Write([]byte{0x05, 0x00})
		req := make([]byte, 4)
		if _, err = io.ReadFull(c, req); err != nil {
			return
		}
		var host string
		switch req[3] {
		case 1:
			addr := make([]byte, 4)
			_, _ = io.ReadFull(c, addr)
			host = net.IP(addr).String()
		case 3:
			n := make([]byte, 1)
			_, _ = io.ReadFull(c, n)
			name := make([]byte, n[0])
			_, _ = io.ReadFull(c, name)
			host = string(name)
		default:
			return
		}
		_, _ = io.ReadFull(c, make([]byte, 2))
		got <- socksSeen{atyp: req[3], host: host}
		up, err := net.Dial("tcp", upstream)
		if err != nil {
			return
		}
		defer up.Close()
		port := make([]byte, 2)
		binary.BigEndian.PutUint16(port, 1)
		_, _ = c.Write([]byte{0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, port[0], port[1]})
		go func() { _, _ = io.Copy(up, c) }()
		_, _ = io.Copy(c, up)
	}()
	return ln
}
