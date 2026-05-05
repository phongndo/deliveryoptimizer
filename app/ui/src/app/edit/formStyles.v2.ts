/**
 * Hi-fi Tailwind class tokens for the edit page redesign.
 * References CSS variables from edit.module.css — do not use hard-coded hex values here.
 * Mid-fi tokens live in formStyles.ts (do not modify that file).
 */

export const SIDEBAR_ROOT =
  "hidden lg:block w-[68px] shrink-0 self-stretch bg-[var(--edit-stone-50)] overflow-hidden";

export const SIDEBAR_NAV = "flex flex-col gap-4 pt-4 px-2";

export const SIDEBAR_NAV_ITEM_ACTIVE =
  "flex flex-col gap-1 items-center w-full";

export const SIDEBAR_NAV_ITEM_INACTIVE =
  "flex flex-col gap-1 items-center w-full cursor-pointer";

export const SIDEBAR_NAV_ITEM_DISABLED =
  "flex flex-col gap-1 items-center w-full opacity-[0.26] cursor-not-allowed";

export const SIDEBAR_NAV_PILL_ACTIVE =
  "w-full flex items-center justify-center rounded-[80px] bg-[var(--edit-container-active)] px-[9px] py-[4px]";

export const SIDEBAR_NAV_PILL_INACTIVE =
  "w-full flex items-center justify-center rounded-[80px] px-[9px] py-[4px]";

export const SIDEBAR_NAV_PILL_DISABLED =
  "w-full flex items-center justify-center rounded-[80px] px-[9px] py-[4px]";

export const SIDEBAR_NAV_LABEL_ACTIVE =
  "text-[14px] leading-5 font-bold text-[var(--edit-text-primary)] text-center whitespace-nowrap";

export const SIDEBAR_NAV_LABEL_INACTIVE =
  "text-[14px] leading-5 font-medium text-[var(--edit-text-primary)] text-center whitespace-nowrap";

export const NAVBAR_V2_ROOT =
  "bg-[var(--edit-stone-50)] flex items-center justify-between p-4";

export const NAVBAR_V2_LOGO =
  "font-bold text-[20px] leading-7 text-[var(--edit-text-primary)] whitespace-nowrap";

export const NAVBAR_V2_ACTIONS = "flex items-center gap-2";

export const NAVBAR_V2_BTN_OUTLINE =
  "h-9 px-4 rounded-[80px] border border-[var(--edit-stone-700)] font-semibold text-[14px] leading-5 text-[var(--edit-text-primary)] whitespace-nowrap hover:bg-[var(--edit-secondary-btn-hover)] active:bg-[var(--edit-secondary-btn-pressed)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export const NAVBAR_V2_BTN_FILLED =
  "h-9 px-4 rounded-[80px] bg-[var(--edit-btn-primary)] font-semibold text-[14px] leading-5 text-[var(--edit-text-temporary)] whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  
export const PAGE_V2_BODY = "flex flex-1 min-h-0";

export const PAGE_V2_MAIN =
  "flex-1 min-w-0 bg-[var(--edit-bg-primary)] border-t border-l border-[var(--edit-stone-200)] rounded-tl-[12px] p-6 lg:p-8 space-y-8 lg:space-y-10";

export const VEHICLE_INFO_CONTAINER =
  "hidden lg:flex flex-col gap-4 border border-[var(--edit-stone-200)] rounded-[8px] overflow-hidden p-4";

export const VEHICLE_INFO_HEADER_ROW =
  "grid w-full grid-cols-[minmax(7rem,1.2fr)_minmax(5rem,0.8fr)_minmax(6rem,0.9fr)_minmax(7rem,0.9fr)_minmax(7rem,1fr)_5.25rem] gap-4 items-center font-semibold text-[16px] leading-[1.5] text-[var(--edit-text-primary)]";

export const VEHICLE_INFO_HEADER_CELL = "min-w-0 truncate";

export const VEHICLE_INFO_DIVIDER = "border-t border-[var(--edit-stone-200)]";

export const VEHICLE_INFO_ROWS =
  "flex flex-col gap-3";

export const VEHICLE_ROW_DESKTOP =
  "grid w-full grid-cols-[minmax(7rem,1.2fr)_minmax(5rem,0.8fr)_minmax(6rem,0.9fr)_minmax(7rem,0.9fr)_minmax(7rem,1fr)_5.25rem] gap-4 items-center";

export const VEHICLE_ROW_CELL =
  "min-w-0 font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)] truncate";

export const VEHICLE_ROW_STATUS_CELL =
  "min-w-0 h-[38px] flex items-center overflow-hidden";

export const VEHICLE_ROW_STATUS_BADGE_AVAILABLE =
  "bg-[var(--edit-container-success)] flex items-center overflow-hidden px-2 py-[7px] rounded-[4px]";

export const VEHICLE_ROW_STATUS_BADGE_IN_USE =
  "bg-[var(--edit-stone-50)] flex items-center overflow-hidden p-[8px] rounded-[4px]";

export const VEHICLE_ROW_STATUS_TEXT_AVAILABLE =
  "font-semibold text-[16px] leading-[22px] text-[var(--edit-text-success)] whitespace-nowrap";

export const VEHICLE_ROW_STATUS_TEXT_IN_USE =
  "font-semibold text-[16px] leading-[22px] text-[var(--edit-text-secondary)] whitespace-nowrap";

export const VEHICLE_ROW_ACTIONS =
  "flex items-center justify-end gap-1";

export const VEHICLE_ROW_ICON_BUTTON =
  "relative size-10 shrink-0 rounded-[4px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edit-teal-300)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--edit-bg-primary)] hover:bg-[var(--edit-tertiary-btn-hover)] active:bg-[var(--edit-tertiary-btn-pressed)] transition-colors";

export const VEHICLE_SECTION_BTN_GHOST =
  "h-9 px-4 rounded-[80px] font-semibold text-[14px] leading-5 text-[var(--edit-text-primary)] whitespace-nowrap hover:bg-[var(--edit-tertiary-btn-hover)] active:bg-[var(--edit-tertiary-btn-pressed)] transition-colors cursor-pointer";

export const VEHICLE_SECTION_HEADER =
  "flex flex-col gap-2 mb-4";

export const VEHICLE_SECTION_HEADING =
  "font-bold text-[20px] leading-[28px] text-[var(--edit-text-primary)]";

export const VEHICLE_SECTION_SUBHEADING =
  "text-[16px] leading-normal text-[var(--edit-text-secondary)]";

// ── VehicleDetailsOverlay ─────────────────────────────────────────────────────

export const OVERLAY_BACKDROP =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/40";

export const OVERLAY_PANEL =
  "bg-[var(--edit-bg-primary)] flex flex-col gap-[14px] items-end overflow-hidden p-6 rounded-[6px] w-full max-w-[480px] mx-4 shadow-lg max-h-[90dvh]";

export const OVERLAY_BODY =
  "flex flex-col gap-6 items-start w-full flex-1 min-h-0";

export const OVERLAY_SCROLL_BODY =
  "flex flex-col gap-6 items-start w-full overflow-y-auto min-h-0 flex-1";

export const OVERLAY_HEADER =
  "flex items-center justify-between w-full";

export const OVERLAY_TITLE =
  "font-bold text-[20px] leading-7 text-[var(--edit-text-primary)]";

export const OVERLAY_CLOSE_BTN =
  "flex items-center justify-center size-6 text-[var(--edit-text-primary)] hover:opacity-70 transition-opacity cursor-pointer";

export const OVERLAY_ROW =
  "flex gap-4 items-start w-full";

export const OVERLAY_FIELD =
  "flex flex-1 flex-col gap-[6px] items-start min-w-0";

export const OVERLAY_FULL_FIELD =
  "flex flex-col gap-[6px] items-start w-full";

export const OVERLAY_LABEL =
  "font-normal text-[16px] leading-normal text-[var(--edit-text-primary)] w-full";

export const OVERLAY_REQUIRED_STAR =
  "text-[var(--edit-required-asterisk)]";

export const OVERLAY_INPUT =
  "border border-[var(--edit-stone-200)] flex h-11 items-center px-3 rounded-[6px] w-full font-normal text-[16px] leading-6 text-[var(--edit-text-primary)] placeholder:text-[var(--edit-stone-500)] outline-none focus:border-[var(--edit-teal-300)] bg-[var(--edit-bg-primary)] transition-colors";

export const OVERLAY_SELECT_WRAPPER =
  "border border-[var(--edit-stone-200)] flex h-11 items-center justify-between px-3 rounded-[6px] w-full relative overflow-hidden cursor-pointer";

export const OVERLAY_SELECT =
  "appearance-none absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[var(--edit-text-primary)] pl-3 py-3";

export const OVERLAY_SELECT_VALUE =
  "font-normal text-[16px] leading-6 text-[var(--edit-text-primary)] pointer-events-none flex-1 truncate";

export const OVERLAY_SELECT_PLACEHOLDER =
  "font-normal text-[16px] leading-6 text-[var(--edit-stone-500)] pointer-events-none flex-1 truncate";

export const OVERLAY_STATUS_BADGE_AVAILABLE =
  "bg-[var(--edit-container-success)] flex items-center overflow-hidden px-2 py-[7px] rounded-[4px] cursor-pointer select-none shrink-0";

export const OVERLAY_STATUS_BADGE_IN_USE =
  "bg-[var(--edit-stone-50)] flex items-center overflow-hidden p-[8px] rounded-[4px] cursor-pointer select-none shrink-0";

export const OVERLAY_STATUS_BADGE_TEXT_AVAILABLE =
  "font-semibold text-[16px] leading-[22px] text-[var(--edit-text-success)] whitespace-nowrap";

export const OVERLAY_STATUS_BADGE_TEXT_IN_USE =
  "font-semibold text-[16px] leading-[22px] text-[var(--edit-text-secondary)] whitespace-nowrap";

export const OVERLAY_STATUS_HINT =
  "text-[12px] leading-normal text-[var(--edit-text-secondary)]";

export const OVERLAY_DEPARTURE_WRAPPER =
  "border border-[var(--edit-stone-200)] flex h-11 items-center justify-between px-3 rounded-[6px] w-full gap-2 focus-within:border-[var(--edit-teal-300)] transition-colors";

export const OVERLAY_DEPARTURE_INPUT =
  "flex-1 font-normal text-[16px] leading-6 text-[var(--edit-text-primary)] placeholder:text-[var(--edit-stone-500)] outline-none bg-transparent min-w-0";

export const OVERLAY_TIME_SEGMENT_INPUT =
  "w-8 font-normal text-[16px] leading-6 text-[var(--edit-text-primary)] placeholder:text-[var(--edit-stone-500)] outline-none bg-transparent text-center";

export const OVERLAY_TIME_COLON =
  "font-normal text-[16px] leading-6 text-[var(--edit-text-primary)] select-none";

export const OVERLAY_MERIDIEM_WRAPPER =
  "flex gap-1 items-center shrink-0";

export const OVERLAY_MERIDIEM_BTN_ACTIVE =
  "bg-[var(--edit-container-active)] flex items-center justify-center rounded-[2px] size-8 font-normal text-[16px] leading-6 text-[var(--edit-text-primary)] cursor-pointer transition-colors";

export const OVERLAY_MERIDIEM_BTN_INACTIVE =
  "flex items-center justify-center rounded-[2px] size-8 font-normal text-[16px] leading-6 text-[var(--edit-text-primary)] cursor-pointer hover:bg-[var(--edit-stone-50)] transition-colors";

export const OVERLAY_FOOTER =
  "flex gap-[6px] items-center";

export const OVERLAY_CANCEL_BTN =
  "h-9 px-4 rounded-[80px] font-semibold text-[14px] leading-5 text-[var(--edit-text-primary)] whitespace-nowrap hover:bg-[var(--edit-tertiary-btn-hover)] active:bg-[var(--edit-tertiary-btn-pressed)] transition-colors cursor-pointer";

export const OVERLAY_DELETE_BTN =
  "h-9 px-4 rounded-[80px] font-semibold text-[14px] leading-5 text-[var(--edit-error-border)] whitespace-nowrap hover:bg-[var(--edit-tertiary-btn-hover)] active:bg-[var(--edit-tertiary-btn-pressed)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export const OVERLAY_DONE_BTN =
  "h-9 px-4 rounded-[80px] bg-[var(--edit-btn-primary)] font-semibold text-[14px] leading-5 text-[var(--edit-text-primary)] whitespace-nowrap hover:[background:var(--edit-primary-btn-hover)] active:[background:var(--edit-primary-btn-pressed)] transition-colors cursor-pointer";

export const OVERLAY_INPUT_ERROR =
  "border border-[var(--edit-error-border)] flex h-11 items-center px-3 rounded-[6px] w-full font-normal text-[16px] leading-6 text-[var(--edit-text-primary)] placeholder:text-[var(--edit-stone-500)] outline-none bg-[var(--edit-bg-primary)] transition-colors";

export const OVERLAY_SELECT_WRAPPER_ERROR =
  "border border-[var(--edit-error-border)] flex h-11 items-center justify-between px-3 rounded-[6px] w-full relative overflow-hidden cursor-pointer";

export const OVERLAY_DEPARTURE_WRAPPER_ERROR =
  "border border-[var(--edit-error-border)] flex h-11 items-center justify-between px-3 rounded-[6px] w-full gap-2 transition-colors";

export const OVERLAY_FIELD_ERROR_CONTAINER =
  "bg-[var(--edit-error-bg)] flex gap-2 items-center p-2 rounded-[4px] w-full";

export const OVERLAY_FIELD_ERROR_TEXT =
  "font-normal text-[16px] leading-[1.5] text-[var(--edit-error-border)]";
