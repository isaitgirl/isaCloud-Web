import mock from '../../shared/tests/mock.js';
import converse from '../../../../dist/converse.js';

describe('i18n', () => {
    describe('translate', () => {
        it(
            'can translate strings with placeholders',
            mock.initConverse(converse, [], {}, function (_converse) {
                const { __ } = _converse.env.i18n;
                const translated = __('Hello %1$s', 'world');
                expect(translated).toBe('Hello world');
            }),
        );
    });

    describe('pt_BR send-failure strings', () => {
        it(
            'translates the new connection and encryption strings',
            mock.initConverse(converse, [], { i18n: 'pt_BR' }, function (_converse) {
                const { __ } = _converse.env.i18n;
                expect(__('Your message could not be sent because you are not connected.')).toBe(
                    'Sua mensagem não pôde ser enviada porque você não está conectado.',
                );
                expect(__('Not connected')).toBe('Sem conexão');
                expect(__('Sending…')).toBe('Enviando…');
                expect(__('Notes to self')).toBe('Notas para si mesmo');
                expect(__('Open your notes')).toBe('Abrir suas notas');
                expect(__('Your personal messages are end-to-end encrypted')).toBe(
                    'Suas mensagens pessoais são criptografadas ponta a ponta',
                );
            }),
        );
    });

    describe('determineLocale', () => {
        it(
            'returns the preferred locale if supported',
            mock.initConverse(
                converse,
                [],
                {
                    locales: ['en', 'es', 'fr'],
                    i18n: 'es',
                },
                function (_converse) {
                    const { i18n } = _converse.env;
                    const locale = i18n.determineLocale();
                    expect(locale).toBe('es');
                },
            ),
        );

        it(
            'supports regional dialects',
            mock.initConverse(
                converse,
                [],
                {
                    locales: ['en', 'pt_BR', 'pt'],
                    i18n: 'pt_BR',
                },
                function (_converse) {
                    const { i18n } = _converse.env;
                    Object.defineProperty(navigator, 'languages', {
                        value: ['pt-BR'],
                        configurable: true,
                    });
                    const locale = i18n.determineLocale();
                    expect(locale).toBe('pt_BR');
                },
            ),
        );

        it(
            'falls back to the non-regional version',
            mock.initConverse(
                converse,
                [],
                {
                    locales: ['en', 'pt'],
                    i18n: 'pt_BR',
                },
                function (_converse) {
                    const { i18n } = _converse.env;
                    Object.defineProperty(navigator, 'languages', {
                        value: ['pt-BR'],
                        configurable: true,
                    });
                    const locale = i18n.determineLocale();
                    expect(locale).toBe('pt');
                },
            ),
        );

        it(
            'falls back to browser language if preferred not supported',
            mock.initConverse(
                converse,
                [],
                {
                    locales: ['en', 'es', 'fr'],
                    i18n: 'de',
                },
                function (_converse) {
                    const { i18n } = _converse.env;
                    Object.defineProperty(navigator, 'languages', {
                        value: ['fr-FR', 'fr', 'en-US', 'en'],
                        configurable: true,
                    });
                    const locale = i18n.determineLocale();
                    expect(locale).toBe('fr');
                },
            ),
        );

        it(
            'falls back to "en" if no supported locale found',
            mock.initConverse(
                converse,
                [],
                {
                    locales: ['en', 'es', 'fr'],
                    i18n: 'ja',
                },
                function (_converse) {
                    const { i18n } = _converse.env;
                    Object.defineProperty(navigator, 'languages', {
                        value: ['de', 'it'],
                        configurable: true,
                    });
                    const locale = i18n.determineLocale();
                    expect(locale).toBe('en');
                },
            ),
        );
    });
});
