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
  "h-9 px-4 rounded-[80px] bg-[var(--edit-btn-primary)] font-semibold text-[14px] leading-5 text-[var(--edit-text-primary)] whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  
export const PAGE_V2_BODY = "flex flex-1 min-h-0";

export const PAGE_V2_MAIN =
  "flex-1 min-w-0 bg-[var(--edit-bg-primary)] border-t border-l border-[var(--edit-stone-200)] rounded-tl-[12px] p-6 space-y-16";

export const VEHICLE_INFO_CONTAINER =
  "hidden lg:flex flex-col gap-4 border border-[var(--edit-stone-200)] rounded-[8px] overflow-hidden p-4";

export const VEHICLE_INFO_HEADER_ROW =
  "grid w-full grid-cols-[minmax(7rem,1.2fr)_minmax(5rem,0.8fr)_minmax(6rem,0.9fr)_minmax(7rem,0.9fr)_minmax(7rem,1fr)_5.25rem] gap-4 items-center font-semibold text-[16px] leading-[1.5] text-[var(--edit-text-primary)]";

export const VEHICLE_INFO_HEADER_CELL = "min-w-0 truncate";

export const VEHICLE_INFO_DIVIDER = "border-t border-[var(--edit-stone-200)]";

export const VEHICLE_INFO_ROWS =
  "flex flex-col gap-3";

export const VEHICLE_EMPTY_STATE_WRAPPER =
  "flex flex-col gap-4 items-center justify-center py-[28px] shrink-0 w-full";

export const VEHICLE_EMPTY_STATE_ICON =
  "size-12 shrink-0";

export const VEHICLE_EMPTY_STATE_TEXT_GROUP =
  "flex flex-col gap-2 items-center leading-[1.5] text-[16px] text-[var(--edit-text-primary)] whitespace-nowrap";

export const VEHICLE_EMPTY_STATE_TITLE =
  "font-[650]";

export const VEHICLE_EMPTY_STATE_SUBTITLE =
  "font-normal";

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

export const ADDRESS_SECTION_WITH_PAGINATION =
  "flex flex-col gap-4";

export const ADDRESS_SECTION_HEADER =
  "flex flex-col gap-2 mb-4";

export const ADDRESS_SECTION_HEADING =
  "font-bold text-[20px] leading-[28px] text-[var(--edit-text-primary)]";

export const ADDRESS_SECTION_SUBHEADING =
  "text-[16px] leading-normal text-[var(--edit-text-secondary)]";

export const ADDRESS_BTN_V2_DESKTOP_ENABLED =
  "h-10 px-4 shrink-0 rounded-[80px] border border-[var(--edit-stone-700)] font-semibold text-[14px] leading-5 text-[var(--edit-text-primary)] whitespace-nowrap hover:bg-[var(--edit-secondary-btn-hover)] active:bg-[var(--edit-secondary-btn-pressed)] transition-colors cursor-pointer";

export const ADDRESS_BTN_V2_DESKTOP_DISABLED =
  "h-10 px-4 shrink-0 rounded-[80px] border border-[var(--edit-stone-200)] font-semibold text-[14px] leading-5 text-[var(--edit-stone-500)] whitespace-nowrap cursor-not-allowed opacity-50";

export const ADDRESS_BTN_V2_MOBILE_ENABLED =
  "w-full h-10 px-4 rounded-[80px] border border-[var(--edit-stone-700)] font-semibold text-[14px] leading-5 text-[var(--edit-text-primary)] whitespace-nowrap hover:bg-[var(--edit-secondary-btn-hover)] active:bg-[var(--edit-secondary-btn-pressed)] transition-colors cursor-pointer";

export const ADDRESS_BTN_V2_MOBILE_DISABLED =
  "w-full h-10 px-4 rounded-[80px] border border-[var(--edit-stone-200)] font-semibold text-[14px] leading-5 text-[var(--edit-stone-500)] whitespace-nowrap cursor-not-allowed opacity-50";

export const ADDRESS_SEARCH_BAR =
  "flex items-center gap-2 px-4 py-[11px] rounded-[80px] border border-[var(--edit-stone-200)] bg-[var(--edit-stone-50)] focus-within:border-[var(--edit-teal-300)] transition-colors";

export const ADDRESS_SEARCH_INPUT =
  "flex-1 font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)] placeholder:text-[var(--edit-stone-500)] outline-none bg-transparent min-w-0 [&::-webkit-search-cancel-button]:hidden";

// ── Address Row Header (Figma 8012:2303) ──────────────────────────────────────

export const ADDRESS_ROW_HEADER_ROOT =
  "hidden lg:flex gap-4 items-start w-full";

export const ADDRESS_ROW_HEADER_COLS =
  "flex gap-10 items-center font-semibold text-[16px] leading-[1.5] text-[var(--edit-text-primary)] shrink-0";

export const ADDRESS_ROW_HEADER_CELL_RECIPIENT =
  "w-[328px] shrink-0";

export const ADDRESS_ROW_HEADER_CELL_QUANTITY =
  "w-[72px] shrink-0";

export const ADDRESS_ROW_HEADER_CELL_DELIVERY_EST =
  "w-[150px] shrink-0";

export const ADDRESS_ROW_HEADER_CELL_DELIVERY_TIME =
  "w-[247px] shrink-0";

export const ADDRESS_ROW_HEADER_CELL_NOTES =
  "w-[246px] shrink-0";

// ── Address List Container (Figma 7758:2602) ──────────────────────────────────

export const ADDRESS_LIST_CONTAINER =
  "hidden lg:block border border-[var(--edit-stone-200)] rounded-[8px] overflow-x-auto p-4";

export const ADDRESS_LIST_CONTAINER_INNER =
  "flex flex-col gap-4 min-w-max";

export const ADDRESS_LIST_DIVIDER =
  "border-t border-[var(--edit-stone-200)] w-full";

export const ADDRESS_EMPTY_STATE_WRAPPER =
  "flex flex-col gap-4 items-center justify-center py-[28px] shrink-0 w-full";

export const ADDRESS_EMPTY_STATE_ICON =
  "size-12 shrink-0";

export const ADDRESS_EMPTY_STATE_TEXT_GROUP =
  "flex flex-col gap-2 items-center leading-[1.5] text-[16px] text-[var(--edit-text-primary)] whitespace-nowrap";

export const ADDRESS_EMPTY_STATE_TITLE =
  "font-[650]";

export const ADDRESS_EMPTY_STATE_SUBTITLE =
  "font-normal";

// ── Address Row Edit State (Figma 7758:2610) ──────────────────────────────────

export const ADDRESS_ROW_EDIT_ROOT =
  "flex items-start justify-between w-full";

export const ADDRESS_ROW_EDIT_LEFT =
  "flex gap-4 items-start py-2";

export const ADDRESS_ROW_EDIT_COLS =
  "flex gap-10 items-start";

export const ADDRESS_ROW_RECIPIENT_COL =
  "flex flex-col gap-2 w-[328px] shrink-0";

export const ADDRESS_ROW_NAME_ROW =
  "flex items-center gap-[11px] w-full";

export const ADDRESS_ROW_FIELD_INPUT =
  "border border-[var(--edit-stone-200)] h-11 px-2 py-[10px] rounded-[6px] font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)] placeholder:text-[var(--edit-stone-500)] outline-none focus:border-[var(--edit-teal-300)] bg-[var(--edit-bg-primary)] transition-colors min-w-0";

export const ADDRESS_ROW_ADDR_WRAP =
  "relative border border-[var(--edit-stone-200)] flex h-11 items-center rounded-[6px] overflow-hidden w-full cursor-pointer";

export const ADDRESS_ROW_ADDR_GRADIENT =
  "pointer-events-none absolute right-0 top-0 h-full w-[72px] bg-gradient-to-l from-[var(--edit-bg-primary)] from-[60%] to-transparent flex items-center justify-end pr-2";

export const ADDRESS_ROW_ADDR_TRIGGER_TEXT =
  "flex-1 h-full px-2 text-[16px] leading-[1.5] font-normal text-left text-[var(--edit-text-primary)] truncate flex items-center";

export const ADDRESS_ROW_ADDR_TRIGGER_PLACEHOLDER =
  "text-[var(--edit-stone-500)]";

export const ADDRESS_ROW_STEPPER_CONTAINER =
  "border border-[var(--edit-stone-200)] flex h-11 items-center justify-between px-2 py-[10px] rounded-[6px] shrink-0";

export const ADDRESS_ROW_EST_GROUP =
  "flex gap-2 items-center shrink-0 w-[150px]";

export const ADDRESS_ROW_TIME_GROUP =
  "flex gap-2 items-center shrink-0";

export const ADDRESS_ROW_TIME_SELECT_WRAP =
  "border border-[var(--edit-stone-200)] flex h-11 items-center justify-between px-2 py-[10px] rounded-[6px] w-[111px] shrink-0 relative overflow-hidden cursor-pointer";

export const ADDRESS_ROW_TIME_SELECT =
  "absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[var(--edit-text-primary)]";

export const ADDRESS_ROW_NOTES_WRAP =
  "border border-[var(--edit-stone-200)] flex items-start overflow-hidden px-2 py-[10px] rounded-[6px] w-[240px] shrink-0";

export const ADDRESS_ROW_NOTES_TEXTAREA =
  "w-full bg-transparent outline-none text-[16px] leading-[1.5] text-[var(--edit-text-primary)] placeholder:text-[var(--edit-stone-500)] resize-none font-normal overflow-hidden";

export const ADDRESS_ROW_ACTIONS =
  "flex gap-2 items-center shrink-0 self-start pt-2";

export const ADDRESS_ROW_ACTION_BTN =
  "relative size-10 shrink-0 overflow-hidden rounded-[4px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edit-teal-300)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--edit-bg-primary)]";

export const ADDRESS_ROW_LOCKED_CELL =
  "bg-[var(--edit-stone-50)] flex h-11 items-center px-2 py-[10px] rounded-[6px] shrink-0 overflow-hidden";

export const ADDRESS_ROW_LOCKED_RECIPIENT_COL =
  "flex flex-col gap-[4px] w-[328px] shrink-0";

export const ADDRESS_ROW_LOCKED_PLAIN_TEXT =
  "font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)]";

export const ADDRESS_ROW_LOCKED_FIELD_BTN =
  "text-left bg-transparent border-0 p-0 m-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edit-teal-300)] rounded-sm";

export const ADDRESS_ROW_LOCKED_CELL_DELIVERY_EST =
  `${ADDRESS_ROW_LOCKED_PLAIN_TEXT} ${ADDRESS_ROW_LOCKED_FIELD_BTN} w-[150px] shrink-0`;

export const ADDRESS_ROW_LOCKED_NOTES_BTN =
  `${ADDRESS_ROW_LOCKED_PLAIN_TEXT} ${ADDRESS_ROW_LOCKED_FIELD_BTN} w-[240px] shrink-0`;

export const ADDRESS_ROW_LOCKED_NOTES_TEXT =
  "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]";

export const MOBILE_LOCKED_CLICKABLE =
  "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edit-teal-300)]";

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

export const OVERLAY_PRIMARY_BTN =
  "h-9 px-4 rounded-[80px] bg-[var(--edit-btn-primary)] font-semibold text-[14px] leading-5 text-[var(--edit-text-primary)] whitespace-nowrap cursor-pointer";

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

export const OVERLAY_AUTOCOMPLETE_DROPDOWN =
  "fixed z-[100] rounded-[6px] border border-[var(--edit-stone-200)] bg-[var(--edit-bg-primary)] shadow-lg max-h-48 overflow-y-auto";

export const OVERLAY_AUTOCOMPLETE_HEADER =
  "px-3 py-1 border-b border-[var(--edit-stone-200)] font-semibold text-[12px] leading-5 text-[var(--edit-stone-500)]";

export const OVERLAY_AUTOCOMPLETE_ITEM =
  "px-3 py-2 cursor-pointer flex items-start gap-2 text-[16px] text-[var(--edit-text-primary)] border-b border-[var(--edit-stone-200)] last:border-b-0 hover:bg-[var(--edit-stone-50)]";

export const OVERLAY_AUTOCOMPLETE_ITEM_ACTIVE =
  "px-3 py-2 cursor-pointer flex items-start gap-2 text-[16px] text-[var(--edit-text-primary)] border-b border-[var(--edit-stone-200)] last:border-b-0 bg-[var(--edit-container-active)]";

export const OVERLAY_AUTOCOMPLETE_INPUT_WRAPPER =
  "relative w-full";

export const OVERLAY_AUTOCOMPLETE_PIN_ICON =
  "shrink-0 mt-0.5 text-[var(--edit-stone-500)]";

export const OVERLAY_AUTOCOMPLETE_ITEM_TEXT =
  "flex-1 leading-snug";

// ── Pagination V2 (Figma 8083:3520) ──────────────────────────────────────────

export const PAGINATION_V2_ROW =
  "flex items-center justify-between w-full";

export const PAGINATION_V2_SHOW_CONTAINER =
  "border border-[var(--edit-stone-200)] bg-[var(--edit-bg-primary)] flex items-center justify-between p-[8px] rounded-[6px] w-[112px] relative cursor-pointer overflow-hidden";

export const PAGINATION_V2_SHOW_TEXT =
  "font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)] whitespace-nowrap pointer-events-none select-none";

export const PAGINATION_V2_SHOW_CHEVRON =
  "flex items-center justify-center size-[24px] shrink-0 pointer-events-none";

export const PAGINATION_V2_SHOW_CHEVRON_ICON =
  "rotate-90";

export const PAGINATION_V2_SHOW_SELECT =
  "absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[var(--edit-text-primary)]";

export const PAGINATION_V2_NAV_CONTAINER =
  "flex gap-[8px] items-center";

export const PAGINATION_V2_NAV_BTN =
  "border border-[var(--edit-stone-200)] bg-[var(--edit-bg-primary)] flex items-center justify-center p-[8px] rounded-[6px] cursor-pointer hover:bg-[var(--edit-stone-50)] transition-colors";

export const PAGINATION_V2_NAV_BTN_DISABLED =
  "border border-[var(--edit-stone-200)] bg-[var(--edit-bg-primary)] flex items-center justify-center p-[8px] rounded-[6px] opacity-[0.48] cursor-not-allowed";

export const PAGINATION_V2_PAGE_ACTIVE =
  "bg-[var(--edit-pagination-active-bg)] flex items-center justify-center rounded-[100px] size-[40px] font-['Manrope',sans-serif] font-semibold text-[14px] leading-[20px] text-[var(--edit-text-primary)] shrink-0 select-none";

export const PAGINATION_V2_PAGE_INACTIVE =
  "flex items-center justify-center size-[40px] font-['Manrope',sans-serif] font-semibold text-[14px] leading-[20px] text-[var(--edit-text-primary)] shrink-0 cursor-pointer hover:bg-[var(--edit-stone-50)] rounded-[6px] transition-colors";

// ── Page Footer ───────────────────────────────────────────────────────────────

export const FOOTER_ROOT =
  "flex items-center justify-between px-4 py-3";

export const FOOTER_LOGO =
  "shrink-0 w-[25.326px] h-[28px] [aspect-ratio:25.33/28] [background:var(--edit-footer-logo-bg)]";

export const FOOTER_TEXT =
  "font-normal text-[16px] leading-[1.5] text-[var(--edit-text-primary)] whitespace-nowrap";
