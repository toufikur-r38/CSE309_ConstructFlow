# ConstructFlow workflow

ConstructFlow models a Bangladeshi real-estate developer: a land-sharing joint venture with a landowner, government approvals, flat sales on installments, construction, and flat-by-flat handover.

Open `index.html`, or serve this directory with `python -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000`. Use **View as** in the header to switch roles.

## Stages

Every project moves through five stages. A stage can only be completed when its checks on the Overview tab are done. The Managing Director then advances the project.

| Stage | What happens | Checks to move on |
|---|---|---|
| Land & JV | Record landowners (NID, mobile) and the JV agreement: mouza, dag/khatian, katha, share ratio, signing money, monthly rent, deed no. | Landowner, registered deed, share ratio |
| Approvals & sales launch | Submit permits to RAJUK/CDA/KDA/RDA and record decisions. Define floors and flat types to generate flats. Allocate the landowner's flats and set the price list. Plan construction milestones. Sales open once the building plan is approved. | Land use clearance, building plan, fire NOC, environmental clearance; flats; landowner share within 5%; prices; milestones |
| Construction | Daily site logs (quantity, labour, weather, blocker), RFIs, drawings, material requests → purchase orders → deliveries, expenses, budget revisions. | All milestones 100%, orders closed, RFIs answered, no pending revisions, occupancy certificate |
| Flat handover | Hand over each sold and landowner flat with a possession letter. Fix defects and form the owners' association. | Every sold/landowner flat handed over, defects resolved, association formed |
| Closed | Read-only final summary. | — |

## Sales and collections

- **Booking:** choose an available developer flat and a customer. Price = size × rate + parking + utility charge − discount (max 25%).
- **Payment plan:** booking money, then a down payment due in 30 days, then either monthly installments or construction-linked installments. Construction-linked installments are split across the remaining milestones and fall due 15 days after each one completes.
- **Money receipts:** auto-numbered (MR-0001). Each payment is applied to the oldest unpaid installment first. A payment cannot exceed the balance, and cheque or bank payments need a reference.
- **Agreement:** can only be signed after the booking money and down payment are received.
- **Cancellation (MD only):** refund = paid − deduction %. The flat returns to stock, and the deduction counts as forfeited income.
- **Handover blocks:** a buyer's flat needs a signed agreement, zero balance, and no open defects.

## Roles

| Role | Can do |
|---|---|
| Managing Director | Everything, including stage advances, permit decisions, drawing/revision approvals, cancellations, handovers |
| Project Manager | Permits, milestones, site logs, RFIs, procurement, defects, budget revision requests |
| Sales Executive | Customers, flats and price list, landowner allocation, bookings, agreements |
| Accounts Officer | Money receipts, expenses |
| Viewer | Read-only |

## Finance

- Construction budget = original budget + approved revisions. Spending = non-voided expenses.
- Land cost = signing money + monthly rent until the landowner's flats are handed over.
- Projected margin = booked sales + unsold stock at list price + forfeited money − land cost − construction cost (the larger of budget and spending).

## Example projects

Built through the same business rules on first load:

- **Lake View Residence, Dhanmondi:** construction at slab 7, 8 flats sold, 1 booked, 1 cancelled with refund, 2 overdue buyers, an RFI, a pending budget revision, open purchase orders.
- **Sea Breeze Tower, Chattogram (CDA):** handover in progress. Flat 6A is blocked by an unpaid balance and 5B by an open defect.
- **Shapla Heights, Mirpur:** closed, with the full history.
- **Green Haven, Bashundhara:** building plan and fire NOC pending, so sales are blocked. The landowner allocation and price list are still to do.
- **Purbachal Green Valley:** land stage, with no JV agreement yet.

## Code and storage

Open `index.html` (the dashboard). Each module has its own folder holding its pages and its script:

```
index.html     dashboard page          dashboard/    dashboard.js
projects/      register, form, workspace (project tabs)
sales/         bookings and sale detail
customers/     customer list, buyer view
collections/   dues, overdue buyers, receipts
procurement/   requests, orders, deliveries
expenses/      ledger, expense form
approvals/     decisions for the Managing Director
reports/       printable statements and P&L
admin/         team, settings, activity log, account
core/          store.js (records and business rules, no UI) · context.js (routes, page, role)
               ui.js (shared helpers) · app.js (header, rendering, listeners) · app.css
tests/         store.test.cjs, ui.test.cjs
docs/          this guide and the high-fidelity design PDF
```

- Each page names its module in `<body data-page="…">`. All pages load the same scripts, so any page can render any screen.
- A module registers its screens on `CF.pages`, its project tabs on `CF.tabs`, its forms on `CF.forms`, and its buttons on `CF.actions`.
- Run the checks from the project root: `node tests/store.test.cjs` and `node tests/ui.test.cjs`.

Records persist in this browser under `constructflow.records.v3`. Data from the earlier contractor version (`v2`) is not migrated. Roles are views, not authenticated accounts. Multi-user access needs the planned backend.
