-- White-label storefront inputs captured at intake, so the provisioned
-- store's brand config can be filled straight from the application.
alter table retail_os_applications add column if not exists store_categories jsonb;      -- ["Caps", "Bucket hats"]
alter table retail_os_applications add column if not exists product_noun_singular text;  -- "cap"
alter table retail_os_applications add column if not exists product_noun_plural text;    -- "caps"
alter table retail_os_applications add column if not exists sku_attributes jsonb;        -- [{"name":"Size","options":["S","M","L"]}]
