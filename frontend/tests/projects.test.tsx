import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Project, User } from '../src/api/types';
import {
  fail,
  mockApi,
  ok,
  project,
  renderRoutes,
  signedInAs,
  users,
  type MockRequest,
} from './helpers';

function projectBackend(initial: Project[], user: User = users.admin) {
  const state = { projects: [...initial], nextId: 1 };
  // Like the real API: allocated hours are admin-only information.
  const forRole = (p: Project): Project => {
    if (user.role === 'ADMIN') return p;
    const copy = { ...p };
    delete copy.budgetHours;
    return copy;
  };
  const visible = (includeArchived: boolean) =>
    state.projects
      .filter((p) => includeArchived || p.isActive)
      .map((p) =>
        forRole({ ...p, tasks: (p.tasks ?? []).filter((t) => includeArchived || t.isActive) }),
      );
  const handlers = {
    ...signedInAs(user),
    'GET /projects': (req: MockRequest) =>
      ok({ projects: visible(req.query.get('includeArchived') === 'true') }),
    'POST /projects': (req: MockRequest) => {
      const body = req.body as Partial<Project>;
      const created = project({
        id: `new${state.nextId++}`,
        clientName: null,
        startDate: null,
        endDate: null,
        tasks: [],
        ...body,
      });
      state.projects.push(created);
      return ok({ project: created }, 201);
    },
    'PATCH /projects/:id': (req: MockRequest) => {
      const i = state.projects.findIndex((p) => p.id === req.params['id']);
      state.projects[i] = { ...state.projects[i]!, ...(req.body as Partial<Project>) };
      return ok({ project: state.projects[i] });
    },
    'POST /projects/:id/tasks': (req: MockRequest) => {
      const p = state.projects.find((x) => x.id === req.params['id'])!;
      const task = {
        id: `t-new${state.nextId++}`,
        name: (req.body as { name: string }).name,
        isActive: true,
      };
      p.tasks = [...(p.tasks ?? []), task];
      return ok({ task }, 201);
    },
    'PATCH /projects/:id/tasks/:taskId': (req: MockRequest) => {
      const p = state.projects.find((x) => x.id === req.params['id'])!;
      p.tasks = (p.tasks ?? []).map((t) =>
        t.id === req.params['taskId'] ? { ...t, ...(req.body as object) } : t,
      );
      return ok({ task: p.tasks.find((t) => t.id === req.params['taskId']) });
    },
  };
  return { state, handlers };
}
const card = (code: string) =>
  within(screen.getByRole('region', { name: new RegExp(`^${code} ·`) }));
const open = async (backend: ReturnType<typeof projectBackend>, extra = {}) => {
  const api = mockApi({ ...backend.handlers, ...extra });
  renderRoutes('/projects');
  await screen.findByRole('heading', { name: 'Projects' });
  return api;
};

describe('projects: browsing (every role)', () => {
  it.each([
    ['contributor', users.contributor],
    ['manager', users.manager],
  ])(
    'shows active projects with budget, client and tasks to a %s — and no admin controls',
    async (_l, user) => {
      const backend = projectBackend(
        [project({ startDate: '2026-01-01', endDate: '2026-12-31' })],
        user,
      );
      await open(backend);

      const alpha = await screen.findByRole('region', { name: /ALPHA · Alpha Platform/ });
      expect(within(alpha).getByText('Acme')).toBeInTheDocument();
      expect(within(alpha).queryByText('Budget')).not.toBeInTheDocument(); // budgets are admin-only
      expect(within(alpha).getByText('1 Jan – 31 Dec 2026')).toBeInTheDocument();
      expect(within(alpha).getByText('Build')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Edit project|^Archive|^Restore/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('form', { name: /Add task/ })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Show archived projects')).not.toBeInTheDocument();
    },
  );

  it('shows an empty state (different wording for admins)', async () => {
    await open(projectBackend([], users.contributor));
    expect(
      await screen.findByText('An admin has not set up any projects yet.'),
    ).toBeInTheDocument();
  });

  it('shows an admin the way forward when there are no projects', async () => {
    await open(projectBackend([]));
    expect(await screen.findByText('Create the first project above.')).toBeInTheDocument();
  });

  it('shows a retryable error', async () => {
    let failing = true;
    mockApi({
      ...signedInAs(users.contributor),
      'GET /projects': () =>
        failing
          ? fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
          : ok({ projects: [project()] }),
    });
    renderRoutes('/projects');

    const alert = await screen.findByRole('alert');
    failing = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('region', { name: /ALPHA/ })).toBeInTheDocument();
  });
});

describe('projects: admin management', () => {
  it('lists archived projects on request and offers to restore them', async () => {
    const backend = projectBackend([
      project(),
      project({ id: 'p9', code: 'OLD', name: 'Old Thing', isActive: false }),
    ]);
    const api = await open(backend);
    expect(screen.queryByRole('region', { name: /OLD/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Show archived projects'));

    expect(await screen.findByRole('region', { name: /OLD · Old Thing/ })).toBeInTheDocument();
    expect(api.calls('GET /projects').at(-1)?.query.get('includeArchived')).toBe('true');
    expect(card('OLD').getByText('Archived')).toBeInTheDocument();
    expect(card('OLD').getByRole('button', { name: 'Restore project OLD' })).toBeInTheDocument();
  });

  it('validates a new project on the client without calling the API', async () => {
    const api = await open(projectBackend([]));
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    const form = within(screen.getByRole('form', { name: 'New project' }));

    await userEvent.click(form.getByRole('button', { name: 'Create project' }));

    expect(form.getByText(/Use 1–32 letters/)).toBeInTheDocument();
    expect(form.getByText('Enter a project name')).toBeInTheDocument();
    expect(form.getByText(/Enter the budget in hours/)).toBeInTheDocument();
    expect(api.calls('POST /projects')).toHaveLength(0);
  });

  it('creates a project and shows it in the list', async () => {
    const api = await open(projectBackend([]));
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    const form = within(screen.getByRole('form', { name: 'New project' }));

    await userEvent.type(form.getByLabelText('Code'), ' GAMMA ');
    await userEvent.type(form.getByLabelText('Name'), 'Gamma Rollout');
    await userEvent.type(form.getByLabelText('Client (optional)'), 'Globex');
    await userEvent.type(form.getByLabelText('Budget (hours)'), '250.5');
    fireEvent.change(form.getByLabelText('Start date (optional)'), {
      target: { value: '2026-04-01' },
    });
    await userEvent.click(form.getByRole('button', { name: 'Create project' }));

    expect(
      await screen.findByRole('region', { name: /GAMMA · Gamma Rollout/ }),
    ).toBeInTheDocument();
    expect(api.calls('POST /projects')[0]?.body).toEqual({
      code: 'GAMMA',
      name: 'Gamma Rollout',
      clientName: 'Globex',
      budgetHours: 250.5,
      startDate: '2026-04-01',
    });
    expect(screen.queryByRole('form', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('rejects an end date before the start date on the client', async () => {
    await open(projectBackend([]));
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    const form = within(screen.getByRole('form', { name: 'New project' }));
    await userEvent.type(form.getByLabelText('Code'), 'X1');
    await userEvent.type(form.getByLabelText('Name'), 'X');
    await userEvent.type(form.getByLabelText('Budget (hours)'), '5');
    fireEvent.change(form.getByLabelText('Start date (optional)'), {
      target: { value: '2026-05-01' },
    });
    fireEvent.change(form.getByLabelText('End date (optional)'), {
      target: { value: '2026-04-01' },
    });

    await userEvent.click(form.getByRole('button', { name: 'Create project' }));

    expect(form.getByText('The end date cannot be before the start date')).toBeInTheDocument();
  });

  it('shows the backend message for a duplicate code and keeps the form open', async () => {
    const backend = projectBackend([]);
    await open(backend, {
      'POST /projects': fail(409, 'CONFLICT', 'Project code "GAMMA" already exists'),
    });
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    const form = within(screen.getByRole('form', { name: 'New project' }));
    await userEvent.type(form.getByLabelText('Code'), 'GAMMA');
    await userEvent.type(form.getByLabelText('Name'), 'Gamma');
    await userEvent.type(form.getByLabelText('Budget (hours)'), '10');

    await userEvent.click(form.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Project code "GAMMA" already exists',
    );
    expect(screen.getByRole('form', { name: 'New project' })).toBeInTheDocument();
  });

  it('edits only the changed fields, and sends null for a cleared optional field', async () => {
    const backend = projectBackend([project({ startDate: '2026-01-01' })]);
    const api = await open(backend);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit project ALPHA' }));
    const form = within(screen.getByRole('form', { name: 'Edit project' }));

    await userEvent.clear(form.getByLabelText('Name'));
    await userEvent.type(form.getByLabelText('Name'), 'Alpha 2');
    await userEvent.clear(form.getByLabelText('Client (optional)'));
    fireEvent.change(form.getByLabelText('Start date (optional)'), { target: { value: '' } });
    await userEvent.click(form.getByRole('button', { name: 'Save project' }));

    await waitFor(() => expect(api.calls('PATCH /projects/:id')).toHaveLength(1));
    expect(api.calls('PATCH /projects/:id')[0]?.body).toEqual({
      name: 'Alpha 2',
      clientName: null,
      startDate: null,
    });
    expect(await screen.findByRole('region', { name: /ALPHA · Alpha 2/ })).toBeInTheDocument();
  });

  it('archives and restores a project', async () => {
    const backend = projectBackend([project()]);
    const api = await open(backend);

    await userEvent.click(await screen.findByRole('button', { name: 'Archive project ALPHA' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /ALPHA/ })).not.toBeInTheDocument(),
    );
    expect(api.calls('PATCH /projects/:id')[0]?.body).toEqual({ isActive: false });

    await userEvent.click(screen.getByLabelText('Show archived projects'));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore project ALPHA' }));
    await waitFor(() =>
      expect(api.calls('PATCH /projects/:id').at(-1)?.body).toEqual({ isActive: true }),
    );
  });

  it('shows why an admin action was refused by the backend', async () => {
    const backend = projectBackend([project()]);
    await open(backend, {
      'PATCH /projects/:id': fail(
        403,
        'FORBIDDEN',
        'You do not have permission to perform this action',
      ),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Archive project ALPHA' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission');
    expect(screen.getByRole('region', { name: /ALPHA/ })).toBeInTheDocument();
  });
});

describe('projects: tasks (admin)', () => {
  it('adds a task and clears the input', async () => {
    const backend = projectBackend([project()]);
    const api = await open(backend);
    const form = within(await screen.findByRole('form', { name: 'Add task to ALPHA' }));

    await userEvent.type(form.getByLabelText('New task'), 'Deploy');
    await userEvent.click(form.getByRole('button', { name: 'Add task' }));

    expect(await card('ALPHA').findByText('Deploy')).toBeInTheDocument();
    expect(api.calls('POST /projects/:id/tasks')[0]?.body).toEqual({ name: 'Deploy' });
    expect(form.getByLabelText('New task')).toHaveValue('');
  });

  it('does not allow adding an empty task name', async () => {
    await open(projectBackend([project()]));
    const form = within(await screen.findByRole('form', { name: 'Add task to ALPHA' }));

    expect(form.getByRole('button', { name: 'Add task' })).toBeDisabled();
  });

  it('shows the backend message for a duplicate task name', async () => {
    await open(projectBackend([project()]), {
      'POST /projects/:id/tasks': fail(
        409,
        'CONFLICT',
        'Task "Build" already exists in this project',
      ),
    });
    const form = within(await screen.findByRole('form', { name: 'Add task to ALPHA' }));

    await userEvent.type(form.getByLabelText('New task'), 'Build');
    await userEvent.click(form.getByRole('button', { name: 'Add task' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Task "Build" already exists');
  });

  it('renames and archives a task', async () => {
    const backend = projectBackend([project()]);
    const api = await open(backend);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Rename task Build in ALPHA' }),
    );
    const form = within(screen.getByRole('form', { name: 'Rename task Build' }));
    await userEvent.clear(form.getByLabelText('Task name'));
    await userEvent.type(form.getByLabelText('Task name'), 'Implementation');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(await card('ALPHA').findByText('Implementation')).toBeInTheDocument();
    expect(api.calls('PATCH /projects/:id/tasks/:taskId')[0]?.body).toEqual({
      name: 'Implementation',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Archive task Review in ALPHA' }));
    await waitFor(() =>
      expect(api.calls('PATCH /projects/:id/tasks/:taskId').at(-1)?.body).toEqual({
        isActive: false,
      }),
    );
    await waitFor(() => expect(card('ALPHA').queryByText('Review')).not.toBeInTheDocument());
  });
});
