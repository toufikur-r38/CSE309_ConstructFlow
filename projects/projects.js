/* Projects module: project register and the create/edit form. */
(function () {
  'use strict';

  const {C, params, projectId, store, STOP, navigate, url, can, today, isOpen, projectUrl, link, button, input, select, form, table, card, heading, projectOf, projectRows, unavailable} = CF.ui;

  function projectList(records, title = 'Projects') {
    const search = (params.get('q') || '').toLowerCase();
    const status = params.get('status') || '';
    const projects = records.projects.filter(project => (!status || project.status === status) && `${project.name} ${project.location} ${project.authority}`.toLowerCase().includes(search));
    const filters = `<form class="filters" data-form="filter">${input('q', 'Search', params.get('q') || '', 'search')}${select('status', 'Stage', C.statuses, status, 'All stages')}<button class="button" type="submit">Apply filters</button></form>`;
    return heading(title, 'Every project moves through land, approvals, construction, handover, and closure.', can('project') ? link('Start a project', url('project-form'), true) : '') +
      card('Project register', filters + table(['Project', 'Stage', 'Construction', 'Flats sold', 'Collected', 'Next step'], projectRows(projects), 'No projects match these filters.'));
  }

  function projectForm(records, project = null) {
    if (!can('project')) return unavailable('Only the Managing Director can create or edit projects.');
    if (project && !isOpen(project)) return unavailable('This project is closed.');
    const fields = `<div class="form-row">${input('name', 'Project name', project?.name, 'text', 'required maxlength="150" placeholder="e.g. Lake View Residence"')}${select('authority', 'Approving authority', C.authorities, project?.authority || 'RAJUK')}</div>
      ${input('location', 'Plot address', project?.location, 'text', 'required placeholder="Plot, road, area, city"')}
      <div class="form-row">${input('start', 'Start date', project?.start || today(), 'date', 'required')}${input('end', 'Planned handover', project?.end, 'date', 'required')}</div>
      ${project ? '<p class="status-line">The construction budget is preserved. Submit a budget revision to change it.</p>' : input('costBudget', 'Construction budget (BDT)', '', 'number', 'min="1" step="1" required') + '<p class="status-line">New projects start at the Land stage. Record the landowner and JV agreement next.</p>'}`;
    return heading(project ? 'Edit project' : 'Start a project', project ? project.name : 'Register the plot once. Every later record links to this project.', link('Back to projects', url('projects'))) +
      card('Project details', form(project ? 'edit-project' : 'add-project', fields, project ? 'Save changes' : 'Create project', true, project?.id || ''));
  }

  CF.pages.projects = (records, title) => projectList(records, title);
  CF.pages['project-form'] = records => {
    if (!projectId) return projectForm(records);
    const project = projectOf(records, projectId);
    return project ? projectForm(records, project) : unavailable('Choose an existing project to edit.');
  };

  CF.forms['add-project'] = data => {
    navigate(projectUrl(store.addProject(data).id, 'land'));
    return STOP;
  };
  CF.forms['edit-project'] = (data, pid) => {
    store.editProject(pid, data);
    navigate(projectUrl(pid));
    return STOP;
  };
})();
