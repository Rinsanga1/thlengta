exports.index = (_req, res) => {
  res.renderPage("home/index", {
    title: "Thleng Ta! | Simple staff attendance for your team!",
    metaDescription: "Thlengta is a lightweight attendance + staff tracking system built for small shops and teams. Retro-friendly UI, modern reliability.",
    themeColor: "#fbfaf6",
    favicon: "/assets/img/favicon.ico",
    useWrap: false  // Marketing page doesn't use wrapper
  });
};
