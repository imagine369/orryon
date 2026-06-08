interface ChatActivationScreenProps {
  activationPlan: string;
}

export function ChatActivationScreen({ activationPlan }: ChatActivationScreenProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="text-center px-6">
        <div className="mx-auto mb-6 h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        <p className="text-[17px] font-medium text-white/90">
          Activating your {activationPlan}…
        </p>
        <p className="mt-2 text-[13px] text-white/55 max-w-[260px] mx-auto">
          You’ll be chatting with Orryon in just a moment.
        </p>
      </div>
    </div>
  );
}
