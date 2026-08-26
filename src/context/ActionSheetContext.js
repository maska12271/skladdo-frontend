import { createContext, useContext } from 'react'

/**
 * True for anything rendered inside the page header's mobile action sheet.
 *
 * A toolbar that opens its own dropdown has nowhere sensible to put it once it is itself a row in a
 * sheet: a menu hanging off a full-width row either covers the rows beneath it or opens a second layer
 * over the first. So the components that have one flatten instead — `DataToolbar` lists its export
 * formats as ordinary rows rather than behind a trigger — which also means every row in the sheet is a
 * terminal action, and the sheet can close on any of them.
 *
 * In its own module because a file that exports both a component and a hook loses fast refresh for that
 * component.
 */
export const ActionSheetContext = createContext(false)

export const useInActionSheet = () => useContext(ActionSheetContext)
