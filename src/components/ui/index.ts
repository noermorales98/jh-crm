/**
 * UI kit de J&H CRM. Importaciones consistentes:
 *
 *   import { Button, Card, StatusPill, Table, ... } from "@/src/components/ui";
 *
 * Componentes client: SearchInput, FilterBar/FilterSelect/FilterDate,
 * Tabs, Modal, ConfirmDialog, UserMenu. El resto son server-safe.
 */
export { Button, ButtonLink, buttonClasses } from "./button";
export type { ButtonVariant, ButtonSize } from "./button";
export { Input, Textarea, inputClasses } from "./input";
export { Select } from "./select";
export type { SelectOption } from "./select";
export { DateInput } from "./date-input";
export { Field } from "./field";
export { Card, CardHeader, CardBody } from "./card";
export { Pill, StatusPill, StagePill } from "./pill";
export type { PillTone, PillDomain } from "./pill";
export { Table, THead, TBody, TR, TH, TD } from "./table";
export { CursorPagination } from "./pagination";
export { EmptyState } from "./empty-state";
export { Modal } from "./modal";
export { ConfirmDialog } from "./confirm-dialog";
export { Alert } from "./alert";
export { PageHeader } from "./page-header";
export { SearchInput } from "./search-input";
export { FilterBar, FilterSelect, FilterDate } from "./filter-bar";
export type { FilterOption } from "./filter-bar";
export { ListToolbar } from "./list-toolbar";
export { Tabs } from "./tabs";
export { UserMenu } from "./user-menu";
export { Tooltip, Popover } from "./tooltip";
