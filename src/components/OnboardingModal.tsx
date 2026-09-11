interface OnboardingModalProps {
  onDismiss: () => void;
}

const steps = [
  { number: "1", title: "Take a picture", text: "Snap any document with your camera or choose from photos", icon: "📷" },
  { number: "2", title: "Adjust & enhance", text: "Auto-crop, apply filters like B&W or receipt mode", icon: "✨" },
  { number: "3", title: "Download your PDF", text: "Get a searchable PDF with OCR, ready to save or share", icon: "📄" },
];

export function OnboardingModal({ onDismiss }: OnboardingModalProps) {
  const close = () => {
    try { localStorage.setItem("docsnap-onboarding-seen", "true"); } catch { /* storage may be unavailable */ }
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl shadow-black/50 sm:p-8" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-2xl shadow-lg shadow-indigo-600/25">📑</div>
          <h2 id="onboarding-title" className="text-2xl font-bold text-white">How DocSnap Works</h2>
          <p className="mt-2 text-sm text-gray-400">Turn paper documents into polished PDFs in seconds.</p>
        </div>
        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.number} className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-sm font-bold text-indigo-400">{step.number}</div>
              <div className="flex-1"><h3 className="font-semibold text-gray-100">{step.icon} {step.title}</h3><p className="mt-0.5 text-sm leading-relaxed text-gray-400">{step.text}</p></div>
            </div>
          ))}
        </div>
        <button onClick={close} className="mt-7 w-full rounded-full bg-indigo-600 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-indigo-500 active:scale-[.98]">Get Started</button>
        <button onClick={close} className="mx-auto mt-3 block text-sm text-gray-500 underline-offset-4 transition hover:text-gray-300 hover:underline">Skip</button>
      </div>
    </div>
  );
}
