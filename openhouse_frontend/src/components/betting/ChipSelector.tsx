import { CHIP_DENOMINATIONS, ChipDenomination } from './chipConfig';

interface ChipSelectorProps {
  onAddChip: (chip: ChipDenomination) => void;
  canAddChip: (value: number) => boolean;
  disabled: boolean;
  size?: 'xs' | 'mobile' | 'sm' | 'md';
  variant?: 'full' | 'compact';  // 'compact' = 3 chips for mobile (red, green, blue)
  layout?: 'horizontal' | 'vertical';
  // Selection mode for roulette - clicking selects a chip instead of adding to bet
  selectionMode?: boolean;
  selectedValue?: number;
  onSelect?: (value: number) => void;
}

export function ChipSelector({
  onAddChip,
  canAddChip,
  disabled,
  size = 'md',
  variant = 'full',
  layout = 'horizontal',
  selectionMode = false,
  selectedValue,
  onSelect,
}: ChipSelectorProps) {
  // Filter chips based on variant - compact shows only $0.10, $1, $5 for mobile
  const chips = variant === 'compact'
    ? CHIP_DENOMINATIONS.filter(c => ['red', 'green', 'blue'].includes(c.color))
    : CHIP_DENOMINATIONS;

  // Explicit sizes for distinct layouts
  const sizeClasses = {
    xs: { img: 'w-7 h-7', gap: 'gap-0.5' },           // 28px
    mobile: { img: 'w-[30px] h-[30px]', gap: 'gap-1' }, // 30px (~7% bigger than xs)
    sm: { img: 'w-9 h-9', gap: 'gap-1' },             // 36px
    md: { img: 'w-12 h-12', gap: 'gap-2' },           // 48px
  };
  const { img: imgClass, gap: gapClass } = sizeClasses[size];

  const flexDirection = layout === 'vertical' ? 'flex-col' : '';

  const handleClick = (chip: ChipDenomination) => {
    if (selectionMode && onSelect) {
      onSelect(chip.value);
    } else {
      onAddChip(chip);
    }
  };

  const isSelected = (chip: ChipDenomination) => {
    if (!selectionMode || selectedValue === undefined) return false;
    return Math.abs(chip.value - selectedValue) < 0.001;
  };

  return (
    <div className={`flex items-center ${flexDirection} ${gapClass}`}>
      {chips.map(chip => (
        <button
          key={chip.color}
          onClick={() => handleClick(chip)}
          disabled={disabled || (!selectionMode && !canAddChip(chip.value))}
          className={`chip-button transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 ${
            isSelected(chip) ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : ''
          }`}
          title={selectionMode ? `Select $${chip.value.toFixed(2)}` : `Add $${chip.value.toFixed(2)}`}
        >
          <img
            src={chip.topImg}
            alt={chip.label}
            className={`${imgClass} object-contain drop-shadow-md`}
          />
        </button>
      ))}
    </div>
  );
}