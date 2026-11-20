<!doctype html>
<html lang="fa" dir="rtl">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#101923">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <title>{{ ($page ?? 'workspace') === 'sign-in' ? 'ورود | ERP' : 'کالاها | ERP' }}</title>
        @viteReactRefresh
        @vite('resources/js/app.tsx')
    </head>
    <body>
        <div id="app" data-page="{{ $page ?? 'workspace' }}"></div>
    </body>
</html>
