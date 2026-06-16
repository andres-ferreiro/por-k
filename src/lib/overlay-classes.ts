export const MODAL_OVERLAY_CLASSES =
  "fixed inset-0 z-50 bg-black/25 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

export const DIALOG_CONTENT_CLASSES =
  "fixed z-50 grid w-full gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl border-b-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:overflow-visible sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:fade-out-0 sm:data-[state=open]:fade-in-0";
