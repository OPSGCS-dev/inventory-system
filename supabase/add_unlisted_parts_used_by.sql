-- Used By for the 48 "unlisted parts" found in storage K205 (sheet 'UNLISTED PARTS - NOTED SEPT 10').
-- Run this ONCE in the Supabase SQL editor, AFTER the parts have been added with Master List > Import List
-- (build/unlisted_parts/unlisted-parts-NEW-ROWS-ONLY.csv). It is safe to run twice: it only adds what is missing.
--
-- What it does (adds rows to project_parts; nothing else is touched):
--   * the 34 "GM Parts" (ground mount)  -> all nine SunE sites (Alfred, Hwy 2S, Norfolk, Odessa, Ray, Rutley, Sandhurst,
--                                           South Stormont, Unity)
--   * the 14 "RT Parts" (rooftop)       -> Firelight Solar LP
--   * ALL 48 parts also -> Firelight Operations LP (FLOPS). This is only so FLOPS can hold the stock for now: the stock
--     screens list a part under an entity only if the entity has the part on its Required Inventory sheet. When the
--     real owners are known, move the units with Ownership > Update Count > Individual Adjustment, then untick
--     these parts for Firelight Operations LP on Required Inventory.
--
-- Parts are found by manufacturer + Mfr Part # (or manufacturer + description for the five with no part number), and
-- only among parts numbered above 379 so an older part with the same number is never picked up.
-- The script prints a NOTICE for any part or entity it could not find; read the messages after running.

begin;

create temporary table _unlisted_parts (pn text, mfr text, descr text, grp text) on commit drop;

insert into _unlisted_parts (pn, mfr, descr, grp) values
  ('E50.R16-155N10', 'ELECTRONICON', 'Capacitor / Electronicon E50.R16-155N10, 1450 uF, 700 V', 'GM'),   -- GM  E50.R16-155N10
  ('2866776', 'PHOENIX CONTACT', 'Power Supply / Phoenix Contact QUINT-PS/1AC/24DC/20 (2866776), 24 VDC, 20 A', 'GM'),   -- GM  2866776
  ('LA 603', 'DELTA', 'Surge Arrester / Delta LA 603, lightning arrester', 'GM'),   -- GM  LA 603
  ('2891001', 'PHOENIX CONTACT', 'Network Switch / Phoenix Contact FL Switch (2891001)', 'GM'),   -- GM  2891001
  ('A6K 600R', 'FERRAZ SHAWMUT', 'Fuse / Ferraz Shawmut A6K 600R, 600 A, 600 V', 'GM'),   -- GM  A6K 600R
  ('SCAST1015GR1', 'SMA', 'Circuit Board / SMA SCAST1015GR1', 'GM'),   -- GM  SCAST1015GR1
  ('SC20ACBGE2-00.01', 'SMA', 'Circuit Board / SMA SC20ACBGE2-00.01, circuit board with L1, L2, L3 / Possibly a contactor module (unconfirmed)', 'GM'),   -- GM  SC20ACBGE2-00.01
  ('SC20DCEBG1E1-00.01', 'SMA', 'Circuit Board / SMA SC20DCEBG1E1-00.01, circuit board with L1, L2, L3 / Possibly a contactor module (unconfirmed)', 'GM'),   -- GM  SC20DCEBG1E1-00.01
  ('K3G190-RY53-05', 'SMA', 'Fan / EBM-papst K3G190-RY53-05, AC cabinet fan / SMA inverter fan', 'GM'),   -- GM  K3G190-RY53-05
  ('LTNS 8002', 'MICROELETTRICA', 'Contactor / Microelettrica LTNS 8002 DC contactor, 200 VDC coil', 'GM'),   -- GM  LTNS 8002
  ('CM1400DU-24NF', 'MITSUBISHI ELECTRIC', 'IGBT Module / Mitsubishi Electric CM1400DU-24NF', 'GM'),   -- GM  CM1400DU-24NF
  ('MCPIP-T187-011', 'MULTICOMP', 'Proximity Sensor / Multicomp MCPIP-T187-011, inductive proximity sensor', 'GM'),   -- GM  MCPIP-T187-011
  ('HDR-150-12', 'MEAN WELL', 'Power Supply / Mean Well HDR-150-12, 12 VDC, 150 W / Ultra-slim DIN rail switching power supply', 'GM'),   -- GM  HDR-150-12
  ('EHG7305-4POE', 'ATOP TECHNOLOGIES', 'Network Switch / Atop EHG7305-4POE, industrial unmanaged Gigabit Ethernet switch', 'GM'),   -- GM  EHG7305-4POE
  ('D1210', 'CRYDOM', 'Solid State Relay / Crydom D1210', 'GM'),   -- GM  D1210
  ('HEB355AM2971', 'HADDA', 'Fan / Hadda HEB355AM2971, EC centrifugal fan', 'GM'),   -- GM  HEB355AM2971
  ('K3G310-AV69-09', 'EBMPAPST', 'Fan / EBM K3G310-AV69-09 / SMA IGBT fan', 'GM'),   -- GM  K3G310-AV69-09
  ('EKI-2728M-BE', 'ADVANTECH', 'Network Switch / Advantech EKI-2728M-BE, unmanaged Ethernet switch', 'GM'),   -- GM  EKI-2728M-BE
  ('1MBI1600VC-120P', 'FUJI', 'IGBT Module / Fuji 1MBI1600VC-120P', 'GM'),   -- GM  1MBI1600VC-120P
  ('BTK6-1515-D250-CS-OV', 'BENTEK', 'Combiner Box / Bentek BTK6-1515-D250-CS-OV, 250 A', 'GM'),   -- GM  BTK6-1515-D250-CS-OV
  ('BTK6-0615-D100-CS-OV', 'BENTEK', 'Combiner Box / Bentek BTK6-0615-D100-CS-OV, 100 A', 'GM'),   -- GM  BTK6-0615-D100-CS-OV
  ('BTK6-0915-D200-CS-OV', 'BENTEK', 'Combiner Box / Bentek BTK6-0915-D200-CS-OV, 200 A', 'GM'),   -- GM  BTK6-0915-D200-CS-OV
  ('', 'THE FILTER FACTORY', 'Air Filter / 24.25 x 33.5 x 2 in / No part number', 'GM'),   -- GM  Air Filter - 24.25 x 33.5 x 2 in
  ('', 'THE FILTER FACTORY', 'Air Filter / 12 5/8 x 38 x 2 in / No part number', 'GM'),   -- GM  Air Filter - 12 5/8 x 38 x 2 in
  ('A 145-30', 'ABB', 'Contactor / ABB A 145-30, 145 A, 3-phase, 690 VAC', 'GM'),   -- GM  A 145-30
  ('NDR-120-24', 'MEAN WELL', 'Power Supply / Mean Well NDR-120-24, 24 VDC, 120 W / DIN rail power supply, 240 VAC input', 'GM'),   -- GM  NDR-120-24
  ('B32362A2307 J050', 'EPCOS', 'Capacitor / EPCOS B32362A2307 J050, 300 uF +/-5%, 750 V', 'GM'),   -- GM  B32362A2307 J050
  ('E32362-B2207-J050', 'EPCOS', 'Capacitor / EPCOS E32362-B2207-J050, 200 uF +/-5%, 750 V', 'GM'),   -- GM  E32362-B2207-J050
  ('947C601K801CCIS', 'CORNELL DUBILIER', 'Capacitor / Cornell Dubilier 947C601K801CCIS, 600 uF, 800 VDC', 'GM'),   -- GM  947C601K801CCIS
  ('GD123-3DUL', 'SEMIKRON', 'Power Module / Semikron GD123-3DUL, SKiiP power module', 'GM'),   -- GM  GD123-3DUL
  ('2938248', 'PHOENIX CONTACT', 'Power Supply / Phoenix Contact QUINT-PS-100-240AC/48DC/10 (2938248), 48 VDC, 10 A, 100-240 VAC in', 'GM'),   -- GM  2938248
  ('DS50PVS-600', 'CITEL', 'Surge Arrester / Citel DS50PVS-600, DC surge arrester, 680 VDC', 'GM'),   -- GM  DS50PVS-600
  ('MGATE MB3170', 'MOXA', 'Modbus Gateway / Moxa MGate MB3170, 1-port Modbus gateway', 'GM'),   -- GM  MGATE MB3170
  ('947C231K102CAIS', 'CORNELL DUBILIER', 'Capacitor / Cornell Dubilier 947C231K102CAIS, 230 uF, 1000 VDC', 'GM'),   -- GM  947C231K102CAIS
  ('563PCDMF', 'CSC', 'Capacitor / CSC 563PCDMF, 5 kVAR, 600 VAC', 'RT'),   -- RT  563PCDMF
  ('OJ-0P-153180-02', 'SCHNEIDER', 'Circuit Board / Schneider OJ-0P-153180-02, matrix board', 'RT'),   -- RT  OJ-0P-153180-02
  ('0J-0P-0786-01-02Q', 'SCHNEIDER', 'Circuit Board / Schneider 0J-0P-0786-01-02Q, matrix board', 'RT'),   -- RT  0J-0P-0786-01-02Q
  ('1033052806', 'XANTREX', 'Circuit Board / Xantrex 1033052806, IGBT driver board', 'RT'),   -- RT  1033052806
  ('', 'BENTEK', 'Combiner Box / Bentek, small / Model not recorded', 'RT'),   -- RT  Combiner Box - Bentek, small
  ('', 'BENTEK', 'Combiner Box / Bentek, large / Model not recorded', 'RT'),   -- RT  Combiner Box - Bentek, large
  ('0J-0P-3964-01-02Q', 'XANTREX', 'Circuit Board / Xantrex 0J-0P-3964-01-02Q, PCB communications board', 'RT'),   -- RT  0J-0P-3964-01-02Q
  ('', 'THE FILTER FACTORY', 'Air Filter / 24 x 19.5 x 2 in / No part number', 'RT'),   -- RT  Air Filter - 24 x 19.5 x 2 in
  ('22-1002621', 'AEI', 'Circuit Board / Advanced Energy 22-1002621, AC distribution PCB assembly, 600 V / For the 250 kW AEI inverter', 'RT'),   -- RT  22-1002621
  ('22-1002620', 'AEI', 'Circuit Board / Advanced Energy 22-1002620, AC distribution PCB assembly, 600 V / For the 250 kW AEI inverter', 'RT'),   -- RT  22-1002620
  ('22-1002528', 'AEI', 'Circuit Board / Advanced Energy 22-1002528, gating board / For the 100 kW AEI inverter', 'RT'),   -- RT  22-1002528
  ('22-600051', 'AEI', 'Circuit Board / Advanced Energy 22-600051, AE board', 'RT'),   -- RT  22-600051
  ('22-600044', 'AEI', 'Circuit Board / Advanced Energy 22-600044, AE board', 'RT'),   -- RT  22-600044
  ('22-600064', 'AEI', 'Circuit Board / Advanced Energy 22-600064, main AC distribution board', 'RT');   -- RT  22-600064

create temporary table _unlisted_entities on commit drop as
select id, name,
       (name in ('SunE Alfred LP','SunE Hwy 2S LP','SunE Norfolk LP','SunE Odessa LP','SunE Ray LP','SunE Rutley LP',
                 'SunE Sandhurst LP','SunE South Stormont LP','SunE Unity LP')) as is_gm,
       (name = 'Firelight Solar LP') as is_rt,
       (name in ('Firelight Operations LP','FLOPS')) as is_parking
from public.projects
where name in ('SunE Alfred LP','SunE Hwy 2S LP','SunE Norfolk LP','SunE Odessa LP','SunE Ray LP','SunE Rutley LP',
               'SunE Sandhurst LP','SunE South Stormont LP','SunE Unity LP','Firelight Solar LP',
               'Firelight Operations LP','FLOPS');

create temporary table _unlisted_match on commit drop as
select u.pn, u.mfr, u.grp, p.gcs_id
from _unlisted_parts u
left join public.parts p
  on p.gcs_id > 379
 and p.manufacturer = u.mfr
 and (case when u.pn <> '' then p.manufacturer_part_number = u.pn
           else replace(p.description, E'\n', ' / ') = u.descr end);

do $$
declare r record; n integer;
begin
  for r in select * from _unlisted_match where gcs_id is null loop
    raise notice 'NOT FOUND in the Master List (was it imported?): % %', r.mfr, coalesce(nullif(r.pn, ''), '(no part number)');
  end loop;
  for r in select pn, mfr, count(*) c from _unlisted_match where gcs_id is not null group by pn, mfr, gcs_id having count(*) > 1 loop
    raise notice 'Matched more than once: % %', r.mfr, r.pn;
  end loop;
  select count(*) into n from _unlisted_entities where is_gm;
  if n <> 9 then raise notice 'Only % of the 9 SunE sites were found by name.', n; end if;
  if not exists (select 1 from _unlisted_entities where is_rt) then raise notice 'Firelight Solar LP was not found by name.'; end if;
  if not exists (select 1 from _unlisted_entities where is_parking) then raise notice 'Firelight Operations LP was not found by name.'; end if;
end $$;

insert into public.project_parts (project_id, part_gcs_id)
select e.id, m.gcs_id
from _unlisted_match m
join _unlisted_entities e
  on e.is_parking or (m.grp = 'GM' and e.is_gm) or (m.grp = 'RT' and e.is_rt)
where m.gcs_id is not null
on conflict (project_id, part_gcs_id) do nothing;

-- What the new parts are now used by:
select p.gcs_id as "GCS P/N", p.manufacturer_part_number as "Mfr Part #", count(pp.*) as "Used by (entities)"
from (select distinct gcs_id from _unlisted_match where gcs_id is not null) m
join public.parts p on p.gcs_id = m.gcs_id
left join public.project_parts pp on pp.part_gcs_id = p.gcs_id
group by p.gcs_id, p.manufacturer_part_number
order by p.gcs_id;

commit;
