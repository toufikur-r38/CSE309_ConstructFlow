// Demo UI permissions mirror ConstructFlow's admin_required/write_access_required.
// This static preview does not authenticate users or enforce server permissions.
(() => {
    "use strict";
    const roles = ["admin", "operator", "viewer"];
    const params = new URLSearchParams(location.search);
    let savedRole;
    try { savedRole = sessionStorage.getItem("constructflow.demoRole"); } catch (_) { /* file preview */ }
    const requested = params.get("role") || savedRole || "admin";
    const role = roles.includes(requested) ? requested : "viewer";
    const label = role[0].toUpperCase() + role.slice(1);
    try { sessionStorage.setItem("constructflow.demoRole", role); } catch (_) { /* URL fallback */ }
    const adminPages = ["register.html", "edit_user.html", "audit_log.html", "all_edited_projects.html", "all_edited_costs.html", "all_removed_projects.html", "all_removed_costs.html"];
    const writePages = ["add_project.html", "edit_project.html", "select_cost_project.html", "add_cost.html", "edit_cost.html", "dropdown_options.html"];
    const allowed = page => (!adminPages.includes(page) || role === "admin") && (!writePages.includes(page) || role !== "viewer");
    const page = location.pathname.split("/").pop() || "index.html";
    if (!allowed(page)) {
        location.replace("index.html?role=" + role);
        return;
    }
    function applyRole() {
        document.documentElement.dataset.previewRole = role;
        document.querySelectorAll("a[href]").forEach(link => {
            const raw = link.getAttribute("href");
            if (!raw || raw.startsWith("#")) return;
            const url = new URL(raw, location.href);
            if (url.origin !== location.origin) return;
            const target = url.pathname.split("/").pop();
            if (!target.endsWith(".html")) return;
            if (!allowed(target)) {
                const container = link.matches(".action-card") ? link.parentElement : link.closest("li") || link;
                container.remove();
                return;
            }
            if (target === "login.html") {
                link.addEventListener("click", () => {
                    try { sessionStorage.removeItem("constructflow.demoRole"); } catch (_) { /* optional storage */ }
                });
            } else {
                url.searchParams.set("role", role);
                link.setAttribute("href", target + url.search + url.hash);
            }
        });
        if (role !== "admin") document.getElementById("systemManageMenu")?.closest("li")?.remove();
        if (role === "viewer") {
            document.querySelectorAll('[data-preview-kind="save"], [data-bs-target="#voidProjectModal"], [data-bs-target="#voidModal"]').forEach(element => element.remove());
        }
        // Replace the exported administrator identity without altering scripts/styles.
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.parentElement.closest("script, style")) continue;
            node.nodeValue = node.nodeValue.replace(/@superadmin/g, "@demo_" + role)
                .replace(/Super Admin|Superadmin|superadmin/g, "Demo " + label)
                .replace(/Admin Dashboard/g, label + " Dashboard")
                .replace(/Admin Actions/g, role === "viewer" ? "Reports & Ledgers" : label + " Actions");
        }
        if (page === "index.html") document.title = label + " Dashboard - ConstructFlow";
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyRole);
    else applyRole();
})();
