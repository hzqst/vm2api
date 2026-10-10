FROM archlinux:latest
ENV LANG=C.UTF-8
ENV PATH=/usr/local/lib/nodejs/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
RUN pacman -Sy --noconfirm --needed ca-certificates curl git tzdata python bash procps-ng \
 && pacman -Scc --noconfirm \
 && (getent group 987 >/dev/null || groupadd -g 987 kincli) \
 && (getent passwd 999 >/dev/null || useradd -u 999 -g 987 -d /home/kincli -m -s /bin/bash kincli) \
 && mkdir -p /home/kincli && chown 999:987 /home/kincli \
 && echo "archlinux" > /etc/kin-os \
 && echo "claude-code=2.1.293" > /etc/kin-claude
WORKDIR /home/kincli
USER 999:987
CMD ["sleep", "infinity"]
