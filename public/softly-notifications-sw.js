self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const openWindow = windows.find((client) => "focus" in client);
        return openWindow ? openWindow.focus() : clients.openWindow(destination);
      }),
  );
});
