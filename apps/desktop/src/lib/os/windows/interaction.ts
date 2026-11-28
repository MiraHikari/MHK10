/** One policy feeds canvas clients and iframe interaction for the current frame. */
export interface InteractionState {
  desktop: boolean;
  systemInput: boolean;
  manipulating: boolean;
  desktopMenu: boolean;
  modal: boolean;
  start: boolean;
  pointerDown: boolean;
  menuOpen: boolean;
}

export function interactionPolicy(state: InteractionState) {
  const clear =
    state.desktop &&
    !state.systemInput &&
    !state.manipulating &&
    !state.desktopMenu &&
    !state.start;
  return {
    html: clear && !state.modal && !state.pointerDown && !state.menuOpen,
    client(focused: boolean, modal: boolean, menu: boolean) {
      return clear && focused && (!state.modal || modal) && !menu;
    },
    pointer(owned: boolean, menu: boolean) {
      return clear && owned && !menu;
    },
  };
}
