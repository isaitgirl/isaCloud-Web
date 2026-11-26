export type Field = {
    type: 'text' | 'checkbox';
    label: string; // The form label for the input field.
    name: string; // The name for the input field.
    challenge?: string; // A challenge value that must be provided by the user.
    challenge_failed?: boolean;
    placeholder?: string; // The placeholder for the input field.
    required?: boolean; // Whether the field is required or not
    value?: string;
};

export type ToastProperties = {
    title?: string;
    body?: string;
    name: string;
    type: 'info' | 'danger';
    action?: {
        label: string;
        handler: () => void;
    };
    /** Where the toast sits; `composer` puts it just above the message field. */
    placement?: 'top' | 'composer';
    /** `light` gives a neutral light card instead of the theme's info blue. */
    appearance?: 'default' | 'light';
};
