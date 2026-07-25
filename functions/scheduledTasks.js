const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { sendAndCreateNotification } = require("./notificationManager");

// This file contains the logic for scheduled tasks like reminders, due dates, and recurring tasks.

/**
 * A scheduled function that runs every 5 minutes to check for tasks.
 */
exports.taskScheduler = onSchedule("every 5 minutes", async (event) => {
  const now = Timestamp.now();
  const db = getFirestore();

  // --- 1. Handle Reminders ---
  const reminderQuery = db.collection('tasks').where('reminder', '!=', null).where('reminder', '<=', now).where('reminderNotificationSent', '==', false);
  const reminders = await reminderQuery.get();
  
  for (const doc of reminders.docs) {
    const task = doc.data();
    const title = `Recordatorio: ${task.title}`;
    const body = `Recuerda la tarea: "${task.title}".`;
    const path = `/tasks`; // Simplified path

    const recipients = Array.from(new Set([task.createdBy, task.assignedTo].filter(Boolean)));
    for (const userId of recipients) {
      await sendNotification(userId, title, body, path);
    }

    await doc.ref.update({ reminderNotificationSent: true });
  }

  // --- 2. Handle Due Dates (at 8:00 AM) ---
  const todayAt8AM = new Date();
  todayAt8AM.setHours(8, 0, 0, 0);

  // Run only if current time is past 8 AM for today.
  if (new Date() > todayAt8AM) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const dueDateQuery = db.collection('tasks')
          .where('dueDate', '>=', startOfDay)
          .where('dueDate', '<=', endOfDay)
          .where('dueDateNotificationSent', '==', false);

      const dueTasks = await dueDateQuery.get();

      for (const doc of dueTasks.docs) {
          const task = doc.data();
          const title = `Vencimiento: ${task.title}`;
          const body = `La tarea "${task.title}" se vence hoy.`;
          const path = `/tasks`;

          const recipients = Array.from(new Set([task.createdBy, task.assignedTo].filter(Boolean)));
          for (const userId of recipients) {
              await sendNotification(userId, title, body, path);
          }

          await doc.ref.update({ dueDateNotificationSent: true });
      }
  }

  // --- 3. Handle Recurring Tasks ---
  const recurringQuery = db.collection('tasks').where('repeat', '!=', null).where('completed', '==', true);
  const recurringTasks = await recurringQuery.get();

  for (const doc of recurringTasks.docs) {
    const task = doc.data();
    const oldDueDate = new Date(task.dueDate || task.createdAt);
    let newDueDate = new Date(oldDueDate);

    switch (task.repeat) {
      case 'Diariamente':
        newDueDate.setDate(oldDueDate.getDate() + 1);
        break;
      case 'Días laborables':
        let daysToAdd = 1;
        if (oldDueDate.getDay() === 5) daysToAdd = 3; // Friday -> Monday
        if (oldDueDate.getDay() === 6) daysToAdd = 2; // Saturday -> Monday
        newDueDate.setDate(oldDueDate.getDate() + daysToAdd);
        break;
      case 'Semanalmente':
        newDueDate.setDate(oldDueDate.getDate() + 7);
        break;
      case 'Mensualmente':
        newDueDate.setMonth(oldDueDate.getMonth() + 1);
        break;
      case 'Anualmente':
        newDueDate.setFullYear(oldDueDate.getFullYear() + 1);
        break;
      default:
        continue; // Skip if repeat value is unknown
    }

    // Reactivate the task for the next cycle
    await doc.ref.update({
      completed: false,
      createdAt: new Date().toISOString(),
      dueDate: newDueDate.toISOString(),
      reminderNotificationSent: false,
      dueDateNotificationSent: false
    });
    console.log(`Task '''${task.title}''' has been reactivated for the next cycle.`);
  }
});
