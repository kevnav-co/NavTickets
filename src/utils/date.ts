
export const timeSince = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 5) return "Ahora";

  let interval = seconds / 31536000; // Años
  if (interval > 1) return `${Math.floor(interval)}a`;
  
  interval = seconds / 2592000; // Meses
  if (interval > 1) return `${Math.floor(interval)}m`;
  
  interval = seconds / 86400; // Días
  if (interval > 1) return `${Math.floor(interval)}d`;
  
  interval = seconds / 3600; // Horas
  if (interval > 1) return `${Math.floor(interval)}h`;
  
  interval = seconds / 60; // Minutos
  if (interval > 1) return `${Math.floor(interval)}min`;

  return "Ahora";
};