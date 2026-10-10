FROM fedora:41
ENV LANG=C.UTF-8
ENV PATH=/usr/local/lib/nodejs/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
RUN dnf install -y ca-certificates curl git tzdata python3 bash procps-ng \
 && dnf clean all \
 && groupadd -g 987 kincli \
 && useradd -u 999 -g 987 -d /home/kincli -m -s /bin/bash kincli \
 && echo "fedora-41" > /etc/kin-os \
 && echo "claude-code=2.1.293" > /etc/kin-claude
WORKDIR /home/kincli
USER kincli
CMD ["sleep", "infinity"]
