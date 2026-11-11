/* Demo records match the project and expenditure ledgers. */
(() => {
    "use strict";
    const projects = [
        { id: "demo-1", name: "Demo - Uttara Residential Building", address: "Uttara, Dhaka", budget: 5000000,
            costs: [["2026-11-10", "Materials", 200, 550, "Cement (bags)"], ["2026-11-11", "Labor", 20, 1200, "Foundation labor (days)"], ["2026-11-12", "Equipment", 3, 5000, "Concrete mixer rental (days)"]] },
        { id: "demo-2", name: "Demo - Mirpur Road Improvement", address: "Mirpur, Dhaka", budget: 3000000,
            costs: [["2026-11-10", "Materials", 100, 2500, "Crushed stone (tons)"], ["2026-11-11", "Labor", 30, 1000, "Road paving crew (days)"], ["2026-11-12", "Equipment", 2, 8000, "Road roller rental (days)"]] }
    ];
    const money = value => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cards = document.getElementById("projectCards");
    if (cards) {
        cards.innerHTML = projects.map(project => {
            const spent = project.costs.reduce((sum, cost) => sum + cost[2] * cost[3], 0);
            return `<div class="col-12 col-md-6" data-project-card><article class="card h-100 shadow-sm"><div class="card-body d-flex flex-column align-items-start gap-2">
                <span class="badge bg-success">Running</span><h5>${project.name}</h5><p class="text-muted mb-0">${project.address}</p>
                <p class="mb-0">Budget: BDT ${money(project.budget)}<br>Spent: BDT ${money(spent)}<br>3 cost entries</p>
                <a class="btn btn-primary mt-auto" href="add_cost.html?project=${project.id}">Add Costs</a>
                </div></article></div>`;
        }).join("");
        document.getElementById("projectSearch").addEventListener("input", event => {
            const search = event.target.value.trim().toLowerCase();
            let matches = 0;
            cards.querySelectorAll("[data-project-card]").forEach(card => {
                card.hidden = !card.textContent.toLowerCase().includes(search);
                if (!card.hidden) matches++;
            });
            document.getElementById("noMatches").hidden = matches > 0;
        });
    }
    const form = document.getElementById("costForm");
    if (!form) return;
    const projectId = new URLSearchParams(location.search).get("project");
    const project = projects.find(item => item.id === projectId);
    if (!project) {
        const params = new URLSearchParams(location.search);
        params.delete("project");
        location.replace("select_cost_project.html" + (params.size ? "?" + params : ""));
        return;
    }
    document.getElementById("costProjectName").textContent = project.name;
    form.elements.namedItem("project_id").value = project.id;
    const ledger = document.getElementById("latestCostEntries");
    ledger.innerHTML = [...project.costs].reverse().map(cost => `<tr><td>${project.name}</td><td>${cost[0]}</td><td>${cost[1]}</td><td>${cost[2]}</td><td>${money(cost[3])}</td><td>${money(cost[2] * cost[3])}</td><td>${cost[4]}</td><td>Demo entry</td></tr>`).join("");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    document.getElementById("costDemoDate").textContent = "Demo ledger · 3 entries";
    const template = document.getElementById("costRowTemplate");
    function prepareRows(root) {
        root.querySelectorAll('select[name="cost_type[]"]').forEach(select => {
            if (select.options.length > 1) return;
            ["Materials", "Labor", "Equipment"].forEach(category => select.add(new Option(category, category)));
        });
        root.querySelectorAll('input[name="date[]"]').forEach(input => { if (!input.value) input.value = today; });
    }
    prepareRows(template.content);
    prepareRows(document.getElementById("costRows"));
})();
