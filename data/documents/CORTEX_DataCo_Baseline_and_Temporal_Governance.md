# DataCo Historical Baseline & Temporal Filtering Governance

**Effective Date:** 2026-11-01  
**Origin Classification:** `enterprise_document`

## 1. Historical vs. Synthetic Calendar Alignment
The public DataCo Supply Chain dataset (`DataCoSupplyChainDataset.csv`, `dataOrigin = public_open_dataset`) captures `65,752` customer `Order` entities and `180,519` order-item lines between `2015-01-01T00:00:00` and `2018-01-31T23:38:00`.

In contrast, the CORTEX synthetic procurement generator (`SYNTHETIC_RANDOM_SEED=20261112`, `dataOrigin = synthetic`) places `120` synthetic `PurchaseOrder` records inside a simulated `2018-01-05` to `2018-02-11` planning horizon across Tier-1/2/3 suppliers (`SYN-SUP-001` through `SYN-SUP-018`).

## 2. Temporal Filtering Rule for Flagship Supplier SYN-SUP-001
The flagship supplier `syn:supplier:SYN-SUP-001` connects via `SUPPLIES` to the top `12` highest-demand DataCo SKUs (`dataco:prod:365`, `191`, `403`, `502`, `565`, `627`, `957`, `977`, `1004`, `1014`, `1073`, `116`). Although those `12` SKUs aggregate `56,345` multi-year historical DataCo orders (`$32,576,680.04` historical sales), their actual DataCo `Order.orderDate` window spans `2015-01-01` through `2017-10-02`.

Therefore, **zero (`0`) real-world current orders** (`as_of_date = 2026-11-12`) and **zero (`0`) 2018-01 scenario-window orders** in DataCo were causally damaged by `SYN-SUP-001`'s synthetic `2018-01` PO delays. Multi-year `2015-2017` DataCo figures MUST be presented strictly as **empirical historical demand exposure benchmarks**, never as currently affected customer orders.

