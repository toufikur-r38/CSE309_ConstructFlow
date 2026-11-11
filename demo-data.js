/* Filtering for the static demo records; no records are persisted. */
(() => {
    "use strict";
    const money = value => "BDT " + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const form = document.getElementById("projectFilterForm") || document.getElementById("filterForm");
    const value = name => form?.elements.namedItem(name)?.value || "";
    function filter() {
        if (document.getElementById("projectTable")) {
            document.querySelectorAll("#projectTable tbody tr[data-project]").forEach(row => {
                row.hidden = (value("project_id") && row.dataset.project !== value("project_id")) ||
                    (value("sector_filter") !== "all" && row.dataset.sector !== value("sector_filter")) ||
                    (value("status_filter") !== "all" && row.dataset.status !== value("status_filter")) ||
                    !row.textContent.toLowerCase().includes(value("search").toLowerCase());
            });
        }
        if (document.getElementById("demoCostTable")) {
            let total = 0, count = 0;
            document.querySelectorAll("#demoCostTable tbody tr").forEach(row => {
                const project = value("project_filter");
                row.hidden = (project && project !== "all" && row.dataset.project !== project) ||
                    (value("type_filter") && row.dataset.category !== value("type_filter")) ||
                    (value("start_date") && row.dataset.date < value("start_date")) ||
                    (value("end_date") && row.dataset.date > value("end_date"));
                if (!row.hidden) { total += Number(row.dataset.amount); count++; }
            });
            document.getElementById("demoCostTotal").textContent = money(total);
            document.getElementById("demoNoCosts").hidden = count > 0;
            document.getElementById("downloadPdfBtn").dataset.resultCount = count;
        }
    }
    if (form) {
        const selected = new URLSearchParams(location.search).get("project");
        const projectField = form.elements.namedItem("project_filter");
        if (selected && projectField && [...projectField.options].some(option => option.value === selected)) projectField.value = selected;
        form.addEventListener("submit", event => { event.preventDefault(); event.stopImmediatePropagation(); filter(); }, true);
        form.addEventListener("input", filter);
        form.addEventListener("change", filter);
        if (window.jQuery) window.jQuery(form).find("select").on("change", filter).trigger("change.select2");
        filter();
    }
    document.querySelectorAll(".js-project-sort").forEach(button => button.addEventListener("click", () => {
        const body = document.getElementById("activeProjectsBody");
        [...body.rows].sort((a, b) => button.dataset.sort === "name" ? a.dataset.name.localeCompare(b.dataset.name) : Number(b.dataset.budget) - Number(a.dataset.budget)).forEach(row => body.appendChild(row));
    }));
})();
