export default function FormField({ label, name, maxLength }: { label: string; name: string; maxLength?: number }) {
    return (
        <label>
            {label}
            <input type="text" name={name} maxLength={maxLength} />
        </label>
    );
}
