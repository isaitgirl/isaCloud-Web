import mock from '../../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

const { u, stx } = converse.env;

describe('The MUC occupants filter', function () {
    it(
        'is open by default and can be used to filter which occupants are shown',
        mock.initConverse(converse, [], {}, async function (_converse) {
            const muc_jid = 'lounge@montague.lit';
            const members = [
                {
                    'nick': 'juliet',
                    'jid': 'juliet@capulet.lit',
                    'affiliation': 'member',
                },
                {
                    'nick': 'tybalt',
                    'jid': 'tybalt@capulet.lit',
                    'affiliation': 'member',
                },
            ];
            await mock.openAndEnterMUC(_converse, muc_jid, 'romeo', [], members);
            const view = _converse.chatboxviews.get(muc_jid);
            await u.waitUntil(() => view.model.occupants.length === 3);

            if (view.model.get('hidden_occupants')) {
                // Happens in headless chrome due to smaller viewport size
                view.model.save('hidden_occupants', false);
            }

            // Open by default, even before the list has more than five occupants.
            let filter_el = await u.waitUntil(() => view.querySelector('converse-list-filter'));
            expect(u.isVisible(filter_el.firstElementChild)).toBe(true);

            for (let i = 0; i < mock.chatroom_names.length; i++) {
                const name = mock.chatroom_names[i];
                const role = mock.chatroom_roles[name].role;
                // See example 21 https://xmpp.org/extensions/xep-0045.html#enter-pres
                const presence = stx`
                <presence to="romeo@montague.lit/pda"
                        from="lounge@montague.lit/${name}"
                        xmlns="jabber:client">
                    <x xmlns="http://jabber.org/protocol/muc#user">
                        <item affiliation="${mock.chatroom_roles[name].affiliation}"
                                jid="${name.replace(/ /g, '.').toLowerCase()}@montague.lit"
                                role="${role}"/>
                    </x>
                </presence>`;
                _converse.api.connection.get()._dataRecv(mock.createRequest(_converse, presence));
            }

            const occupants = await u.waitUntil(() => view.querySelector('.occupant-list'));
            await u.waitUntil(() => occupants.querySelectorAll('li').length > 3);
            expect(occupants.querySelectorAll('li').length).toBe(3 + mock.chatroom_names.length);
            expect(view.model.occupants.length).toBe(3 + mock.chatroom_names.length);

            mock.chatroom_names.forEach((name) => {
                const model = view.model.occupants.findWhere({ 'nick': name });
                const index = view.model.occupants.indexOf(model);
                expect(occupants.querySelectorAll('li .occupant-nick')[index].textContent.trim()).toBe(name);
            });

            // The participants sidebar has no menu of its own anymore, and its
            // close control is a collapse arrow instead of an X.
            expect(view.querySelector('.occupants-header converse-dropdown')).toBe(null);
            expect(view.querySelector('.occupants-header .hide-occupants .fa-angle-double-right')).not.toBe(null);

            const filter = view.querySelector('converse-list-filter .items-filter');
            filter.value = 'j';
            u.triggerEvent(filter, 'keydown', 'KeyboardEvent');
            await u.waitUntil(() => [...view.querySelectorAll('li')].filter(u.isVisible).length === 1);

            view.querySelector('converse-list-filter .fa-times').click();
            await u.waitUntil(
                () => [...view.querySelectorAll('li')].filter(u.isVisible).length === 3 + mock.chatroom_names.length,
            );

            // The heading menu toggles the filter, which is open by default.
            let dropdown = await u.waitUntil(() => view.querySelector('.chatbox-title__buttons converse-dropdown'));
            dropdown.click();
            let toggle_filter = await u.waitUntil(() =>
                view.querySelector('.chatbox-title__buttons converse-dropdown .toggle-filter'),
            );
            expect(toggle_filter.textContent.trim()).toBe('Hide filter');
            toggle_filter.click();
            await u.waitUntil(() => view.querySelector('converse-list-filter') === null);

            dropdown = await u.waitUntil(() => view.querySelector('.chatbox-title__buttons converse-dropdown'));
            dropdown.click();
            toggle_filter = await u.waitUntil(() =>
                view.querySelector('.chatbox-title__buttons converse-dropdown .toggle-filter'),
            );
            expect(toggle_filter.textContent.trim()).toBe('Show filter');
            toggle_filter.click();
            filter_el = await u.waitUntil(() => view.querySelector('converse-list-filter'));
            expect(u.isVisible(filter_el.firstElementChild)).toBe(true);
        }),
    );
});
