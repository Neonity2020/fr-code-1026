export function shouldPollGitStatus(panelOpen: boolean, dialogOpen: boolean, pageVisible: boolean): boolean {
  return panelOpen && !dialogOpen && pageVisible;
}
