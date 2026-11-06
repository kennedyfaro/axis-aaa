FROM freeradius/freeradius-server:3.2.8

COPY sql.template /templates/sql.template
COPY clients.template /templates/clients.template
COPY entrypoint.sh /entrypoint.sh
COPY patch-queries.pl /patch-queries.pl
COPY policy.d/device-access /etc/freeradius/policy.d/device-access
COPY sites/dynamic-clients /etc/freeradius/sites-available/dynamic-clients

RUN chmod +x /entrypoint.sh /patch-queries.pl \
  && ln -sf ../mods-available/sql /etc/freeradius/mods-enabled/sql \
  && ln -sf ../mods-available/dynamic_clients /etc/freeradius/mods-enabled/dynamic_clients \
  && ln -sf ../sites-available/dynamic-clients /etc/freeradius/sites-enabled/dynamic-clients \
  && chown -R freerad:freerad /etc/freeradius /var/log/freeradius /var/run/freeradius

USER freerad
EXPOSE 1812/udp 1813/udp
ENTRYPOINT ["/entrypoint.sh"]
CMD ["freeradius", "-f", "-l", "stdout"]
