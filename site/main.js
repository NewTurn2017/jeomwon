(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const initChatDemo = () => {
    const demo = document.querySelector(".hero-visual");
    if (!demo || reducedMotion) return;

    const steps = {
      customerOne: demo.querySelector('[data-chat-step="customer-one"]'),
      typing: demo.querySelector('[data-chat-step="typing"]'),
      clerkOne: demo.querySelector('[data-chat-step="clerk-one"]'),
      customerTwo: demo.querySelector('[data-chat-step="customer-two"]'),
      confirmation: demo.querySelector('[data-chat-step="confirmation"]'),
      evidence: demo.querySelector('[data-chat-step="evidence"]'),
    };

    demo.classList.add("chat-demo-ready");

    const show = (element) => element?.classList.add("is-visible");
    const hideTyping = () => {
      steps.typing?.classList.remove("is-visible");
      steps.typing?.classList.add("is-gone");
    };

    const play = () => {
      show(steps.customerOne);
      window.setTimeout(() => show(steps.typing), 520);
      window.setTimeout(() => {
        hideTyping();
        show(steps.clerkOne);
      }, 1320);
      window.setTimeout(() => show(steps.customerTwo), 1980);
      window.setTimeout(() => show(steps.confirmation), 2580);
      window.setTimeout(() => show(steps.evidence), 3160);
    };

    if (!("IntersectionObserver" in window)) {
      play();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.3 },
    );

    observer.observe(demo);
  };

  const initCopyButtons = () => {
    const buttons = document.querySelectorAll("[data-copy-target]");

    buttons.forEach((button) => {
      button.addEventListener("click", async () => {
        const targetId = button.dataset.copyTarget;
        const code = targetId ? document.getElementById(targetId) : null;
        if (!code || !navigator.clipboard) return;

        try {
          await navigator.clipboard.writeText(code.textContent ?? "");
          const label = button.querySelector("span");
          if (!label) return;

          window.clearTimeout(button.copyResetTimer);
          label.textContent = "복사됨";
          button.classList.add("is-copied");
          button.copyResetTimer = window.setTimeout(() => {
            label.textContent = "복사";
            button.classList.remove("is-copied");
          }, 1500);
        } catch {
          button.classList.remove("is-copied");
        }
      });
    });
  };

  const initSectionReveals = () => {
    const sections = document.querySelectorAll(".reveal-section");
    if (!sections.length || reducedMotion || !("IntersectionObserver" in window)) return;

    document.documentElement.classList.add("reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14 },
    );

    sections.forEach((section) => observer.observe(section));
  };

  initChatDemo();
  initCopyButtons();
  initSectionReveals();
})();
