/**
 * Sort choices for the filter sheet, taken from the columns the table already declares as sortable.
 *
 * Lives here rather than beside the sheet because a module that exports both a component and a helper
 * breaks fast refresh for that component.
 */
export const sortOptionsFromColumns = (columns) =>
    columns
        .filter((c) => c.sortKey && typeof c.label === 'string' && c.label)
        .map((c) => ({ value: c.sortKey, label: c.label }))
