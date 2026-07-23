import type { PageServerLoad } from './$types';

// Generic "widgets" domain — swap for your data source.
export const load: PageServerLoad = async () => {
  const widgets = await getWidgets(); // your server-only fetch (DB/API)
  return {
    widgets,
    kpis: {
      total: widgets.length,
      active: widgets.filter((w) => w.active).length,
      errors: widgets.filter((w) => w.status === 'error').length,
    },
    // header is rendered by the (app) layout from these — page renders no header
    breadcrumbs: [{ label: 'Widgets' }],
    subtitle: 'Manage your widgets.',
  };
};
