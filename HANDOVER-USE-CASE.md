# ConstructFlow workflow

Open `index.html`, or serve this directory with `python -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000`.

## Start a project

Select **Add project** on the dashboard. Enter the project, client, location, dates, and budget.

- **Already awarded:** the agreed amount becomes the original contract budget. Start planning immediately.
- **Tender stage:** review the estimate under Contract. Add BOQ items or enter the agreed amount, then award the contract. An unsuccessful tender can be closed without starting site work.

The project appears in the dashboard and Projects register. Every subsequent record is linked to that project's ID.

## Plan and execute

1. Under **Planning**, add work packages with planned quantities, units, and dates.
2. Register drawings and their revisions. Approving a revision supersedes the previous approved revision. Document links open the supplied URL.
3. Under **Site logs**, record completed quantities. Work package completion updates the project and dashboard. Overall progress is the average completion of its packages, independent of spending.
4. Under **Procurement**, request materials, issue a purchase order, and acknowledge delivery. Cancelled requests and orders remain in the records.
5. Record actual costs under **Expenses**, from a project, or from a received order. Every expense updates the same ledger, project spending, and dashboard totals.

## Handle changes when needed

A site log may record a blocker. Raising an RFI retains its log, work package, and drawing reference. An administrator records the design response. If it changes scope or cost, submit a priced change linked to that RFI. A direct client instruction can produce a change without an RFI.

Pending changes appear in Approvals and on the dashboard. Approval adjusts the revised budget once. Rejection does not affect the budget. Neither creates an expense.

- Original budget = agreed contract amount at award.
- Revised budget = original budget + approved changes.
- Actual spending = non-voided recorded expenses.
- Budget remaining = revised budget − actual spending.
- Orders and deliveries do not count as expenses automatically.

## Complete and hand over

Complete every planned package, fulfil or cancel outstanding material requests and orders, answer RFIs, decide pending changes, resolve defects, and confirm the required documents. A project does not need an RFI, change, purchase order, or defect if none occurred.

An administrator records client acceptance. The project becomes **Handed over** everywhere and closes to further activity. Its final summary shows dates, approved changes, approved budget, and recorded spending.

## Code and storage

- `app-store.js`: shared records, calculations, and business rules.
- `app.js`: common navigation, views, and form handling.
- `app.css`: shared responsive styling.
- HTML files: small entry pages loading the same application.
- `app-store.test.cjs` and `app-ui.test.cjs`: business-rule and cross-page integration checks. Run each with Node from this directory.

Existing project bookmarks and the six initial expense records are retained. The old isolated workspace simulation is no longer used.

## Example records

Five additional example projects populate the application on first load and are added once to existing installations without replacing user-entered projects:

- **Banani Office Extension:** tender estimate and BOQ ready for award.
- **Dhanmondi Apartment Renovation:** work progress, drawing revisions, site blockers, answered and open RFIs, approved/pending/rejected changes, requests, orders, expenses, and a voided invoice.
- **Chattogram Warehouse Repairs:** completed work with one remaining defect and an outstanding handover document. Resolve the defect and confirm the manual to enable sign-off.
- **Sylhet Community Centre:** completed handover with client acceptance and final spending.
- **Gazipur Boundary Wall:** unsuccessful tender retained in the project register.

Team records and activity history are included. Example drawing links open a local reference SVG, clearly marked as unsuitable for construction. Changes made to the examples persist like other project records; refreshing does not reset them.

Records persist in this browser on this device under `constructflow.records.v2`. Direct file navigation stays on `index.html` to avoid per-file storage isolation. Settings includes JSON export; Expenses includes CSV export. Role views control local actions but are not authenticated accounts. Secure multi-user access across devices requires a server and authentication service.
