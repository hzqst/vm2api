FROM debian:12
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8
ENV PATH=/usr/local/lib/nodejs/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git tzdata python3 bash procps \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -g 987 kincli \
 && useradd -u 999 -g 987 -d /home/kincli -m -s /bin/bash kincli \
 && echo "debian-12" > /etc/kin-os \
 && echo "claude-code=2.1.293" > /etc/kin-claude
WORKDIR /home/kincli
USER kincli
CMD ["sleep", "infinity"]
