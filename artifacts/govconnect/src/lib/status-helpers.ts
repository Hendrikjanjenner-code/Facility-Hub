export function getTicketStatusColor(status: string) {
  switch (status) {
    case 'nieuw': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'in_behandeling': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'wacht_op_info': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'ingepland': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300';
    case 'gereed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'gesloten': return 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export function getTicketStatusLabel(status: string) {
  switch (status) {
    case 'nieuw': return 'Nieuw';
    case 'in_behandeling': return 'In behandeling';
    case 'wacht_op_info': return 'Wacht op info';
    case 'ingepland': return 'Ingepland';
    case 'gereed': return 'Gereed';
    case 'gesloten': return 'Gesloten';
    default: return status;
  }
}

export function getPriorityColor(priority: string) {
  switch (priority) {
    case 'P1': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200';
    case 'P2': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200';
    case 'P3': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200';
    case 'P4': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export function getVisitorStatusColor(status: string) {
  switch (status) {
    case 'verwacht': return 'bg-blue-100 text-blue-800';
    case 'aanwezig': return 'bg-green-100 text-green-800';
    case 'vertrokken': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export function getReservationStatusColor(status: string) {
  switch (status) {
    case 'bevestigd': return 'bg-blue-100 text-blue-800';
    case 'ingecheckt': return 'bg-green-100 text-green-800';
    case 'uitgecheckt': return 'bg-gray-100 text-gray-800';
    case 'geannuleerd': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

// Ensure the helper exists in the repo
export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
