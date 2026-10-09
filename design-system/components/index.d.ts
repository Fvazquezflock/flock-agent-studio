import type * as React from 'react';

/** Names of the icons in the Lucide subset bundled with Flock UI. */
export type IconName = 'search' | 'chevron-down' | 'chevron-up' | 'chevron-left' | 'chevron-right' | 'chevrons-left' | 'chevrons-right' | 'x' | 'check' | 'plus' | 'minus' | 'filter' | 'more-horizontal' | 'more-vertical' | 'calendar' | 'clock' | 'user' | 'users' | 'bell' | 'settings' | 'home' | 'folder' | 'file' | 'upload' | 'download' | 'trash' | 'edit' | 'eye' | 'eye-off' | 'copy' | 'external-link' | 'info' | 'alert-triangle' | 'alert-circle' | 'check-circle' | 'x-circle' | 'menu' | 'logout' | 'arrow-up' | 'arrow-down' | 'arrow-up-right' | 'arrow-right' | 'arrow-left' | 'arrow-up-down' | 'grid' | 'list' | 'columns' | 'star' | 'refresh' | 'bar-chart' | 'lock' | 'mail' | 'send' | 'briefcase' | 'building' | 'receipt' | 'dollar' | 'trending-up' | 'trending-down' | 'sun' | 'moon' | 'help-circle' | 'message' | 'paperclip' | 'folder-open' | 'save' | 'bookmark' | 'sliders' | 'inbox' | 'panel-left' | 'layers' | 'server' | 'git-branch' | 'kanban' | 'sparkles' | 'log-in' | 'zap' | 'calendar-range' | 'file-spreadsheet' | 'command' | 'circle-dot' | 'wifi-off' | 'shield' | 'hourglass';
export type Size = 'sm' | 'md' | 'lg';
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
export type Option<V = string> = string | { value: V; label: string; description?: string; icon?: IconName; disabled?: boolean; group?: string; count?: number };
export interface MenuItem { label?: React.ReactNode; icon?: IconName; onSelect?: () => void; danger?: boolean; disabled?: boolean; shortcut?: string; trail?: React.ReactNode; checked?: boolean; type?: 'separator' | 'label' }

/* ── Layout y navegación ── */
export interface AppShellProps { header?: React.ReactNode; sidebar?: React.ReactNode; footer?: React.ReactNode; children?: React.ReactNode; fixed?: boolean; style?: React.CSSProperties; className?: string }
export declare function AppShell(props: AppShellProps): React.ReactElement;
export interface HeaderProps { logoSrc?: string; product?: string; env?: 'dev' | 'test' | 'uat' | 'prod'; search?: boolean; searchPlaceholder?: string; onSearchFocus?: () => void; notifications?: number; onMenuClick?: () => void; actions?: React.ReactNode; user?: { name: string; role?: string; email?: string; avatar?: string }; userMenuItems?: MenuItem[] }
export declare function Header(props: HeaderProps): React.ReactElement;
export interface NavItem { label: string; icon?: IconName; href?: string; active?: boolean; count?: number; onClick?: () => void; defaultOpen?: boolean; children?: NavItem[]; type?: 'section' }
export interface SidebarProps { items: NavItem[]; footerItems?: NavItem[]; collapsed?: boolean; defaultCollapsed?: boolean; onCollapsedChange?: (c: boolean) => void; collapsible?: boolean; variant?: 'default' | 'brand'; label?: string }
export declare function Sidebar(props: SidebarProps): React.ReactElement;
export interface PageHeaderProps { title: React.ReactNode; description?: React.ReactNode; breadcrumbs?: BreadcrumbItem[]; status?: React.ReactNode; actions?: React.ReactNode; onBack?: () => void; tabs?: React.ReactNode; className?: string }
export declare function PageHeader(props: PageHeaderProps): React.ReactElement;
export interface BreadcrumbItem { label: string; href?: string; onClick?: () => void }
export interface BreadcrumbsProps { items: BreadcrumbItem[] }
export declare function Breadcrumbs(props: BreadcrumbsProps): React.ReactElement;
export interface TabsProps { items: { value: string; label: React.ReactNode; count?: number; icon?: IconName; disabled?: boolean }[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; variant?: 'line' | 'pill'; label?: string }
export declare function Tabs(props: TabsProps): React.ReactElement;
export declare function TabPanel(props: { children?: React.ReactNode }): React.ReactElement;
export interface PaginationProps { total: number; page?: number; defaultPage?: number; onPageChange?: (p: number) => void; pageSize?: number; defaultPageSize?: number; onPageSizeChange?: (s: number) => void; pageSizes?: number[]; noun?: string; compact?: boolean }
export declare function Pagination(props: PaginationProps): React.ReactElement;
export interface StepperProps { steps: { label: string; description?: string; status?: 'done' | 'current' | 'upcoming' | 'error' }[]; current?: number; vertical?: boolean; onStepClick?: (i: number) => void }
export declare function Stepper(props: StepperProps): React.ReactElement;
export interface UserMenuProps { user: { name: string; role?: string; email?: string; avatar?: string }; items?: MenuItem[]; compact?: boolean; defaultOpen?: boolean; onSignOut?: () => void; theme?: 'light' | 'dark'; onThemeChange?: (t: 'light' | 'dark') => void }
export declare function UserMenu(props: UserMenuProps): React.ReactElement;
export interface CommandPaletteProps { open?: boolean; onClose?: () => void; groups: { label: string; items: { label: string; icon?: IconName; hint?: string; shortcut?: string }[] }[]; placeholder?: string; inline?: boolean; onSelect?: (item: { label: string }) => void }
export declare function CommandPalette(props: CommandPaletteProps): React.ReactElement | null;
export interface AppFooterProps { product?: string; version?: string; env?: 'dev' | 'test' | 'uat' | 'prod'; links?: { label: string; href: string }[] }
export declare function AppFooter(props: AppFooterProps): React.ReactElement;
export interface GridProps { cols?: number; gap?: string | number; responsive?: boolean; children?: React.ReactNode; className?: string; style?: React.CSSProperties }
export declare function Grid(props: GridProps): React.ReactElement;
export declare function Col(props: { span?: number; children?: React.ReactNode; className?: string; style?: React.CSSProperties }): React.ReactElement;
export declare function Stack(props: { direction?: 'column' | 'row'; gap?: string | number; align?: string; justify?: string; children?: React.ReactNode; className?: string; style?: React.CSSProperties }): React.ReactElement;

/* ── Acciones ── */
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> { variant?: 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger' | 'inverse'; size?: Size; icon?: IconName; iconRight?: IconName; loading?: boolean; block?: boolean; href?: string; type?: 'button' | 'submit' | 'reset' }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { icon: IconName; label: string; variant?: 'ghost' | 'secondary' | 'primary' | 'danger' | 'inverse'; size?: Size; badge?: number | boolean; pressed?: boolean }
export declare function IconButton(props: IconButtonProps): React.ReactElement;
export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> { variant?: 'default' | 'quiet' | 'muted'; external?: boolean }
export declare function Link(props: LinkProps): React.ReactElement;
export interface MenuProps { items: MenuItem[]; onSelect?: (item: MenuItem) => void; header?: React.ReactNode }
export declare function Menu(props: MenuProps): React.ReactElement;
export interface DropdownMenuProps { trigger: React.ReactElement; items: MenuItem[]; placement?: 'start' | 'end'; open?: boolean; defaultOpen?: boolean; onOpenChange?: (o: boolean) => void; header?: React.ReactNode; closeOnSelect?: boolean; /** position against the viewport (inside tables or scrolling panels) */ fixed?: boolean }
export declare function DropdownMenu(props: DropdownMenuProps): React.ReactElement;
export interface SplitButtonProps { children: React.ReactNode; icon?: IconName; onClick?: () => void; items: MenuItem[]; variant?: 'primary' | 'secondary'; size?: Size; defaultOpen?: boolean; disabled?: boolean }
export declare function SplitButton(props: SplitButtonProps): React.ReactElement;
export interface SegmentedControlProps { options: (string | { value: string; label: string; icon?: IconName })[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; size?: 'sm' | 'md'; block?: boolean; label?: string }
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;
export interface BulkActionBarProps { count: number; noun?: [string, string]; actions: { label: string; icon?: IconName; onClick?: () => void }[]; onClear?: () => void; floating?: boolean }
export declare function BulkActionBar(props: BulkActionBarProps): React.ReactElement | null;

/* ── Formularios ── */
export interface FormFieldProps { label?: React.ReactNode; required?: boolean; optional?: boolean; hint?: React.ReactNode; error?: React.ReactNode; htmlFor?: string; inline?: boolean; className?: string; children: React.ReactNode }
export declare function FormField(props: FormFieldProps): React.ReactElement;
interface ControlBase { size?: Size; invalid?: boolean; disabled?: boolean; id?: string; className?: string }
export interface TextInputProps extends ControlBase, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange' | 'prefix'> { value?: string; defaultValue?: string; onChange?: (v: string, e?: React.ChangeEvent<HTMLInputElement>) => void; icon?: IconName; prefix?: React.ReactNode; suffix?: React.ReactNode; clearable?: boolean; pill?: boolean; showCount?: boolean }
export declare function TextInput(props: TextInputProps): React.ReactElement;
export interface TextareaProps extends ControlBase, Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> { value?: string; defaultValue?: string; onChange?: (v: string) => void; rows?: number; maxLength?: number }
export declare function Textarea(props: TextareaProps): React.ReactElement;
export interface SelectProps<V = string> extends ControlBase { options: Option<V>[]; value?: V | null; defaultValue?: V | null; onChange?: (v: V) => void; placeholder?: string; defaultOpen?: boolean }
export declare function Select<V = string>(props: SelectProps<V>): React.ReactElement;
export interface ComboboxProps<V = string> extends SelectProps<V> { icon?: IconName; emptyText?: string; defaultQuery?: string }
export declare function Combobox<V = string>(props: ComboboxProps<V>): React.ReactElement;
export interface MultiSelectProps<V = string> extends ControlBase { options: Option<V>[]; value?: V[]; defaultValue?: V[]; onChange?: (v: V[]) => void; placeholder?: string; defaultOpen?: boolean; maxChips?: number }
export declare function MultiSelect<V = string>(props: MultiSelectProps<V>): React.ReactElement;
export interface CheckboxProps { label?: React.ReactNode; description?: React.ReactNode; checked?: boolean; defaultChecked?: boolean; indeterminate?: boolean; onChange?: (c: boolean) => void; disabled?: boolean; id?: string; className?: string }
export declare function Checkbox(props: CheckboxProps): React.ReactElement;
export interface CheckboxGroupProps { legend?: React.ReactNode; options: Option[]; value?: string[]; defaultValue?: string[]; onChange?: (v: string[]) => void; row?: boolean }
export declare function CheckboxGroup(props: CheckboxGroupProps): React.ReactElement;
export interface RadioGroupProps { legend?: React.ReactNode; options: Option[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; row?: boolean; cards?: boolean; name?: string }
export declare function RadioGroup(props: RadioGroupProps): React.ReactElement;
export interface SwitchProps { label?: React.ReactNode; checked?: boolean; defaultChecked?: boolean; onChange?: (c: boolean) => void; disabled?: boolean; size?: 'sm' | 'md'; id?: string }
export declare function Switch(props: SwitchProps): React.ReactElement;
export type DateRange = { from: Date | null; to: Date | null };
export interface DatePickerProps extends ControlBase { value?: Date | DateRange | null; defaultValue?: Date | DateRange | null; onChange?: (v: Date | DateRange) => void; range?: boolean; placeholder?: string; presets?: boolean; minDate?: Date; maxDate?: Date; defaultOpen?: boolean }
export declare function DatePicker(props: DatePickerProps): React.ReactElement;
export declare function MiniCalendar(props: { value?: Date | DateRange | null; range?: boolean; onPick: (d: Date) => void; month?: Date; minDate?: Date; maxDate?: Date; today?: Date }): React.ReactElement;
export interface NumberInputProps extends ControlBase { value?: number | null; defaultValue?: number | null; onChange?: (n: number | null) => void; currency?: boolean; decimals?: number; prefix?: string; suffix?: string; placeholder?: string; min?: number; max?: number }
export declare function NumberInput(props: NumberInputProps): React.ReactElement;
export interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange'> { value?: string; defaultValue?: string; onChange?: (v: string) => void; onSearch?: (v: string) => void; shortcut?: string; size?: Size }
export declare function SearchField(props: SearchFieldProps): React.ReactElement;
export interface UploadedFile { name: string; size?: number; progress?: number; error?: string }
export interface FileUploadProps { files?: UploadedFile[]; defaultFiles?: UploadedFile[]; onFiles?: (files: FileList) => void; onRemove?: (f: UploadedFile, index: number) => void; accept?: string; multiple?: boolean; hint?: string; disabled?: boolean }
export declare function FileUpload(props: FileUploadProps): React.ReactElement;
export interface TimePickerProps extends ControlBase { value?: string | null; defaultValue?: string | null; onChange?: (v: string) => void; step?: number; from?: string; to?: string; placeholder?: string; defaultOpen?: boolean }
export declare function TimePicker(props: TimePickerProps): React.ReactElement;
export interface SliderProps { label?: string; min?: number; max?: number; step?: number; value?: number | [number, number]; defaultValue?: number | [number, number]; onChange?: (v: number | [number, number]) => void; format?: (n: number) => React.ReactNode; showScale?: boolean; id?: string }
export declare function Slider(props: SliderProps): React.ReactElement;
export interface FormLayoutProps { children?: React.ReactNode; onSubmit?: (e: React.FormEvent) => void; className?: string }
export declare function FormLayout(props: FormLayoutProps): React.ReactElement;
export declare function FormSection(props: { title?: React.ReactNode; description?: React.ReactNode; columns?: 1 | 2 | 3; stacked?: boolean; children?: React.ReactNode }): React.ReactElement;
export declare function FormActions(props: { children?: React.ReactNode; note?: React.ReactNode; sticky?: boolean }): React.ReactElement;

/* ── Filtros y datos ── */
export interface FilterDropdownProps { label: string; options: Option[]; value?: string[]; defaultValue?: string[]; onChange?: (v: string[]) => void; multiple?: boolean; searchable?: boolean; defaultOpen?: boolean; placement?: 'start' | 'end' }
export declare function FilterDropdown(props: FilterDropdownProps): React.ReactElement;
export interface FilterChipProps { label?: string; value: React.ReactNode; onRemove?: () => void }
export declare function FilterChip(props: FilterChipProps): React.ReactElement;
export interface FilterBarProps { filters: (FilterDropdownProps & { key: string })[]; value?: Record<string, string[]>; defaultValue?: Record<string, string[]>; onChange?: (v: Record<string, string[]>) => void; search?: boolean; searchPlaceholder?: string; searchValue?: string; onSearchChange?: (v: string) => void; onMoreFilters?: () => void; moreCount?: number; actions?: React.ReactNode }
export declare function FilterBar(props: FilterBarProps): React.ReactElement;
export interface FilterGridProps { title?: string; columns?: number; children?: React.ReactNode; more?: React.ReactNode; defaultExpanded?: boolean; onSearch?: () => void; onClear?: () => void; activeCount?: number; variant?: 'default' | 'subtle'; searchLabel?: string }
export declare function FilterGrid(props: FilterGridProps): React.ReactElement;
export interface FilterPanelProps { open?: boolean; onClose?: () => void; title?: string; activeCount?: number; children?: React.ReactNode; onApply?: () => void; onClear?: () => void; inline?: boolean }
export declare function FilterPanel(props: FilterPanelProps): React.ReactElement | null;
export type ColumnFilterType = 'text' | 'select' | 'multi' | 'number' | 'date';
/** text → { op: 'contains' | 'starts' | 'equals' | 'not', q } · select → value · multi → value[] · number → { min, max } · date → { from, to } */
export type ColumnFilterValue = { op?: 'contains' | 'starts' | 'equals' | 'not'; q: string } | string | string[] | { min?: number | null; max?: number | null } | { from?: Date | null; to?: Date | null };
export interface ColumnFilterConfig<R = any> { type: ColumnFilterType; options?: Option[]; placeholder?: string; value?: (row: R) => any; searchable?: boolean; currency?: boolean; decimals?: number; defaultOpen?: boolean }
export interface Column<R = any> { key: string; header: React.ReactNode; align?: 'left' | 'right' | 'center'; sortable?: boolean; sortValue?: (row: R) => any; render?: (row: R) => React.ReactNode; sub?: string; width?: number | string; minWidth?: number | string; sticky?: boolean; wrap?: boolean; filter?: ColumnFilterConfig<R> }
export interface DataTableProps<R = any> { columns: Column<R>[]; rows: R[]; rowKey?: string; selectable?: boolean; selected?: any[]; defaultSelected?: any[]; onSelectionChange?: (ids: any[]) => void; sort?: { key: string; dir: 'asc' | 'desc' } | null; defaultSort?: { key: string; dir: 'asc' | 'desc' } | null; onSortChange?: (s: { key: string; dir: 'asc' | 'desc' } | null) => void; filters?: Record<string, ColumnFilterValue>; defaultFilters?: Record<string, ColumnFilterValue>; onFiltersChange?: (f: Record<string, ColumnFilterValue>) => void; filterMode?: 'menu' | 'row'; manualFilters?: boolean; showFilterSummary?: boolean; density?: 'normal' | 'compact'; striped?: boolean; rowActions?: (row: R) => MenuItem[]; onRowClick?: (row: R) => void; loading?: boolean; loadingRows?: number; empty?: React.ReactNode; toolbar?: React.ReactNode; footer?: React.ReactNode; maxHeight?: number | string; caption?: string; className?: string }
export declare function DataTable<R = any>(props: DataTableProps<R>): React.ReactElement;
export interface ColumnFilterProps<R = any> { column: Column<R>; value?: ColumnFilterValue; onChange?: (v: ColumnFilterValue | undefined) => void; rows?: R[]; variant?: 'icon' | 'field'; defaultOpen?: boolean; placement?: 'start' | 'end' }
export declare function ColumnFilter<R = any>(props: ColumnFilterProps<R>): React.ReactElement;
export interface TableToolbarProps { title?: React.ReactNode; count?: number; search?: boolean; searchPlaceholder?: string; onSearchChange?: (v: string) => void; columns?: { key: string; label: string; visible?: boolean }[]; onColumnsChange?: (c: { key: string; label: string; visible?: boolean }[]) => void; density?: 'normal' | 'compact'; onDensityChange?: (d: 'normal' | 'compact') => void; actions?: React.ReactNode; selectedCount?: number; bulkActions?: React.ReactNode; onClearSelection?: () => void }
export declare function TableToolbar(props: TableToolbarProps): React.ReactElement;
export interface SavedViewsProps { views: { id: string; label: string; count?: number; default?: boolean }[]; value?: string; defaultValue?: string; onChange?: (id: string) => void; onSave?: () => void; onAction?: (action: string, viewId: string) => void }
export declare function SavedViews(props: SavedViewsProps): React.ReactElement;
export interface DescriptionListProps { items: { label: React.ReactNode; value?: React.ReactNode; span?: number; copy?: React.ReactNode }[]; columns?: number; variant?: 'grid' | 'rows' }
export declare function DescriptionList(props: DescriptionListProps): React.ReactElement;
export interface ListProps { items: { title: React.ReactNode; meta?: React.ReactNode; icon?: IconName; avatar?: string; trailing?: React.ReactNode; onClick?: () => void }[]; interactive?: boolean }
export declare function List(props: ListProps): React.ReactElement;
export interface StatCardProps { label: React.ReactNode; value: React.ReactNode; delta?: number; deltaLabel?: string; icon?: IconName; spark?: number[]; variant?: 'default' | 'brand'; invert?: boolean }
export declare function StatCard(props: StatCardProps): React.ReactElement;
export interface ChartProps { type?: 'bar' | 'line' | 'donut'; title?: string; subtitle?: string; categories: string[]; series: { name: string; data: number[] }[]; height?: number; format?: (n: number) => string; centerLabel?: string; showTable?: boolean }
export declare function Chart(props: ChartProps): React.ReactElement;
export interface TimelineProps { items: { title: React.ReactNode; meta?: React.ReactNode; tone?: Tone; icon?: IconName; content?: React.ReactNode }[] }
export declare function Timeline(props: TimelineProps): React.ReactElement;
export interface TreeNode { id: string; label: React.ReactNode; icon?: IconName; meta?: React.ReactNode; children?: TreeNode[] }
export interface TreeViewProps { data: TreeNode[]; defaultExpanded?: string[]; selected?: string | null; defaultSelected?: string | null; onSelect?: (id: string, node: TreeNode) => void }
export declare function TreeView(props: TreeViewProps): React.ReactElement;
export interface KanbanBoardProps { columns: { id: string; title: string; color?: string; cards: { id: string | number; code?: string; title: string; tags?: string[]; assignee?: string; due?: string; comments?: number }[] }[]; onMove?: (cardId: string | number, columnId: string) => void }
export declare function KanbanBoard(props: KanbanBoardProps): React.ReactElement;
export interface CalendarProps { year?: number; month?: number; events: { date: Date; title: string; time?: string; tone?: 'accent' | 'success' | 'warning' | 'info' }[]; today?: Date; maxPerDay?: number; onEventClick?: (e: { date: Date; title: string }) => void }
export declare function Calendar(props: CalendarProps): React.ReactElement;

/* ── Contenedores ── */
export interface CardProps { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; footer?: React.ReactNode; children?: React.ReactNode; variant?: 'default' | 'brand' | 'subtle'; padding?: 'default' | 'roomy' | 'none'; interactive?: boolean; selected?: boolean; onClick?: () => void; className?: string; style?: React.CSSProperties }
export declare function Card(props: CardProps): React.ReactElement;
export interface ModalProps { open: boolean; onClose?: () => void; title?: React.ReactNode; description?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; footer?: React.ReactNode; footerStart?: React.ReactNode; children?: React.ReactNode; inline?: boolean; closeOnBackdrop?: boolean; icon?: React.ReactNode }
export declare function Modal(props: ModalProps): React.ReactElement | null;
export interface ConfirmDialogProps { open: boolean; onClose?: () => void; onConfirm?: () => void; tone?: 'danger' | 'warning' | 'info'; title: React.ReactNode; message?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; confirmText?: string; loading?: boolean; inline?: boolean }
export declare function ConfirmDialog(props: ConfirmDialogProps): React.ReactElement | null;
export interface DrawerProps { open: boolean; onClose?: () => void; title: React.ReactNode; description?: React.ReactNode; side?: 'right' | 'left'; size?: 'md' | 'lg'; footer?: React.ReactNode; children?: React.ReactNode; inline?: boolean; headerExtra?: React.ReactNode }
export declare function Drawer(props: DrawerProps): React.ReactElement | null;
export interface TooltipProps { content: React.ReactNode; placement?: 'top' | 'bottom' | 'right'; open?: boolean; wrap?: boolean; children: React.ReactNode }
export declare function Tooltip(props: TooltipProps): React.ReactElement;
export interface PopoverProps { trigger: React.ReactElement; title?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (o: boolean) => void; placement?: 'start' | 'end'; width?: number }
export declare function Popover(props: PopoverProps): React.ReactElement;
export interface AccordionProps { items: { title: React.ReactNode; meta?: React.ReactNode; icon?: IconName; content: React.ReactNode; defaultOpen?: boolean }[]; multiple?: boolean; variant?: 'plain' | 'card'; defaultOpen?: number[] }
export declare function Accordion(props: AccordionProps): React.ReactElement;
export interface DividerProps { label?: React.ReactNode; vertical?: boolean; strong?: boolean; style?: React.CSSProperties }
export declare function Divider(props: DividerProps): React.ReactElement;

/* ── Feedback y estado ── */
export interface AlertProps { tone?: 'info' | 'success' | 'warning' | 'danger' | 'brand'; title?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; onClose?: () => void; banner?: boolean; outline?: boolean; icon?: IconName; className?: string }
export declare function Alert(props: AlertProps): React.ReactElement | null;
export interface ToastProps { tone?: 'success' | 'info' | 'warning' | 'danger'; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; onClose?: () => void }
export declare function Toast(props: ToastProps): React.ReactElement;
export declare function ToastStack(props: { children?: React.ReactNode; inline?: boolean }): React.ReactElement;
export interface StatusBadgeProps { tone?: Tone; children: React.ReactNode; size?: 'sm' | 'md'; outline?: boolean; dot?: boolean }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;
export interface TagProps { children: React.ReactNode; onRemove?: () => void; selected?: boolean; onClick?: () => void; variant?: 'default' | 'brand'; size?: 'sm' | 'md'; swatch?: string; icon?: IconName }
export declare function Tag(props: TagProps): React.ReactElement;
export interface SpinnerProps { size?: number; label?: string; className?: string }
export declare function Spinner(props: SpinnerProps): React.ReactElement;
export interface SkeletonProps { width?: number | string; height?: number | string; circle?: boolean; lines?: number; radius?: number | string; style?: React.CSSProperties }
export declare function Skeleton(props: SkeletonProps): React.ReactElement;
export interface ProgressBarProps { value?: number; label?: React.ReactNode; hint?: React.ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger'; size?: 'sm' | 'md'; indeterminate?: boolean; showValue?: boolean }
export declare function ProgressBar(props: ProgressBarProps): React.ReactElement;
export declare function ProgressRing(props: { value?: number; size?: number; stroke?: number; label?: string }): React.ReactElement;
export interface EmptyStateProps { icon?: IconName; title?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; compact?: boolean }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;
export interface ErrorPageProps { code?: 403 | 404 | 500 | 503; title?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; requestId?: string; brand?: boolean; logoSrc?: string }
export declare function ErrorPage(props: ErrorPageProps): React.ReactElement;
export interface EnvBadgeProps { env?: 'dev' | 'test' | 'uat' | 'prod'; strip?: boolean }
export declare function EnvBadge(props: EnvBadgeProps): React.ReactElement;

/* ── Personas y colaboración ── */
export interface AvatarProps { name: string; src?: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; status?: 'online' | 'away' | 'busy'; tone?: 't1' | 't2' | 't3' | 't4' | 't5' }
export declare function Avatar(props: AvatarProps): React.ReactElement;
export declare function AvatarGroup(props: { people: (string | { name: string; avatar?: string })[]; max?: number; size?: AvatarProps['size'] }): React.ReactElement;
export interface UserCardProps { name: string; role?: string; email?: string; phone?: string; location?: string; team?: string; tags?: string[]; avatar?: string; status?: AvatarProps['status']; actions?: React.ReactNode | false }
export declare function UserCard(props: UserCardProps): React.ReactElement;
export interface NotificationCenterProps { items: { actor?: string; icon?: IconName; text: React.ReactNode; time: string; unread?: boolean }[]; defaultOpen?: boolean; onMarkAllRead?: () => void; inverse?: boolean; staticPanel?: boolean }
export declare function NotificationCenter(props: NotificationCenterProps): React.ReactElement;
export interface CommentsProps { comments: { author: string; time: string; text: string; reply?: boolean }[]; currentUser?: { name: string }; onSubmit?: (text: string) => void; placeholder?: string }
export declare function Comments(props: CommentsProps): React.ReactElement;

/* ── Utilitarios ── */
export interface IconProps { name: IconName; size?: number; strokeWidth?: number; label?: string; className?: string; style?: React.CSSProperties }
export declare function Icon(props: IconProps): React.ReactElement | null;
export interface CopyButtonProps { value: string; label?: string; showValue?: boolean; copiedLabel?: string }
export declare function CopyButton(props: CopyButtonProps): React.ReactElement;
export interface KbdProps { keys?: string | string[]; children?: React.ReactNode }
export declare function Kbd(props: KbdProps): React.ReactElement;

declare global {
  interface Window {
    FlockUI: {
      html: (strings: TemplateStringsArray, ...values: unknown[]) => React.ReactElement;
      cx: (...classes: (string | false | null | undefined)[]) => string;
      AppShell: typeof AppShell; Header: typeof Header; Sidebar: typeof Sidebar; PageHeader: typeof PageHeader; Breadcrumbs: typeof Breadcrumbs; Tabs: typeof Tabs; TabPanel: typeof TabPanel; Pagination: typeof Pagination; Stepper: typeof Stepper; UserMenu: typeof UserMenu; CommandPalette: typeof CommandPalette; AppFooter: typeof AppFooter; Grid: typeof Grid; Col: typeof Col; Stack: typeof Stack;
      Button: typeof Button; IconButton: typeof IconButton; Link: typeof Link; Menu: typeof Menu; DropdownMenu: typeof DropdownMenu; SplitButton: typeof SplitButton; SegmentedControl: typeof SegmentedControl; BulkActionBar: typeof BulkActionBar;
      FormField: typeof FormField; TextInput: typeof TextInput; Textarea: typeof Textarea; Select: typeof Select; Combobox: typeof Combobox; MultiSelect: typeof MultiSelect; Checkbox: typeof Checkbox; CheckboxGroup: typeof CheckboxGroup; RadioGroup: typeof RadioGroup; Switch: typeof Switch; DatePicker: typeof DatePicker; MiniCalendar: typeof MiniCalendar; NumberInput: typeof NumberInput; SearchField: typeof SearchField; FileUpload: typeof FileUpload; TimePicker: typeof TimePicker; Slider: typeof Slider; FormLayout: typeof FormLayout; FormSection: typeof FormSection; FormActions: typeof FormActions;
      FilterBar: typeof FilterBar; FilterDropdown: typeof FilterDropdown; FilterChip: typeof FilterChip; FilterGrid: typeof FilterGrid; FilterPanel: typeof FilterPanel; DataTable: typeof DataTable; ColumnFilter: typeof ColumnFilter; TableToolbar: typeof TableToolbar; SavedViews: typeof SavedViews; DescriptionList: typeof DescriptionList; List: typeof List; StatCard: typeof StatCard; Chart: typeof Chart; Timeline: typeof Timeline; TreeView: typeof TreeView; KanbanBoard: typeof KanbanBoard; Calendar: typeof Calendar;
      Card: typeof Card; Modal: typeof Modal; ConfirmDialog: typeof ConfirmDialog; Drawer: typeof Drawer; Tooltip: typeof Tooltip; Popover: typeof Popover; Accordion: typeof Accordion; Divider: typeof Divider;
      Alert: typeof Alert; Toast: typeof Toast; ToastStack: typeof ToastStack; StatusBadge: typeof StatusBadge; Tag: typeof Tag; Spinner: typeof Spinner; Skeleton: typeof Skeleton; ProgressBar: typeof ProgressBar; ProgressRing: typeof ProgressRing; EmptyState: typeof EmptyState; ErrorPage: typeof ErrorPage; EnvBadge: typeof EnvBadge;
      Avatar: typeof Avatar; AvatarGroup: typeof AvatarGroup; UserCard: typeof UserCard; NotificationCenter: typeof NotificationCenter; Comments: typeof Comments;
      Icon: typeof Icon; CopyButton: typeof CopyButton; Kbd: typeof Kbd;
    };
  }
}
