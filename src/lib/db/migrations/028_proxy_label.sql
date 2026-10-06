-- 028_proxy_label — operator-chosen display name per proxy row.
--
-- `name` is auto-filled with host:port by the repo and never refreshed when
-- the endpoint is edited, so it cannot tell which machine a proxy belongs to.
-- `label` is free text set from the panel ("代理名称"); NULL means unnamed.

ALTER TABLE proxies ADD COLUMN label TEXT;
