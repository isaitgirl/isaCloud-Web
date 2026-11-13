import { __ } from 'i18n';

/**
 * Returns the translated, human-readable name of a MUC affiliation.
 * Unknown values are returned unchanged.
 * @param {string} [affiliation]
 * @returns {string}
 */
export function getAffiliationLabel(affiliation) {
    /** @type {Record<string, string>} */
    const labels = {
        owner: __('Owner'),
        admin: __('Admin'),
        member: __('Member'),
        outcast: __('Outcast'),
        none: __('None'),
    };
    return affiliation ? (labels[affiliation] ?? affiliation) : '';
}

/**
 * Returns the translated, human-readable name of a MUC role.
 * Unknown values are returned unchanged.
 * @param {string} [role]
 * @returns {string}
 */
export function getRoleLabel(role) {
    /** @type {Record<string, string>} */
    const labels = {
        moderator: __('Moderator'),
        participant: __('Participant'),
        visitor: __('Visitor'),
        none: __('None'),
    };
    return role ? (labels[role] ?? role) : '';
}
