export interface DatePickerProps {
  value: string; // "YYYY-MM-DD"
  min: string; // "YYYY-MM-DD"
  max: string; // "YYYY-MM-DD"
  onChange: (date: string) => void;
}

/** Single date input bounded to the dataset's rolling window. */
export default function DatePicker({ value, min, max, onChange }: DatePickerProps): JSX.Element {
  return (
    <div className="field">
      <label htmlFor="tgvmax-date">Date</label>
      <input
        id="tgvmax-date"
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
