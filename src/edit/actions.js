// The quick actions of the preview's right-click menu and the elements list, as plain
// design → design functions (the UI commits the result, so each is one undo step). DOM-free.

export function hide(design, id) {
  return { ...design, hidden: { ...design.hidden, [id]: true } };
}

export function show(design, id) {
  if (!design.hidden?.[id]) return design;
  const hidden = { ...design.hidden };
  delete hidden[id];
  return { ...design, hidden };
}

export function showAll(design) {
  return Object.keys(design.hidden ?? {}).length ? { ...design, hidden: {} } : design;
}

// Back to where the template puts it.
export function resetLayout(design, id) {
  if (!design.layout?.[id]) return design;
  const layout = { ...design.layout };
  delete layout[id];
  return { ...design, layout };
}

// Every colour the user gave this element goes back to the template's.
export function resetColors(design, id) {
  const keys = Object.keys(design.colors ?? {}).filter((k) => k.startsWith(`${id}.`));
  const hasGradient = !!design.gradients?.[id];
  if (!keys.length && !hasGradient) return design;
  const colors = { ...design.colors };
  for (const k of keys) delete colors[k];
  const gradients = { ...design.gradients };
  delete gradients[id];
  return { ...design, colors, gradients };
}

export const hasOwnColors = (design, id) => !!design.gradients?.[id] || Object.keys(design.colors ?? {}).some((k) => k.startsWith(`${id}.`));
export const hiddenCount = (design) => Object.keys(design.hidden ?? {}).length;
