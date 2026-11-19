# Correção dos erros TypeScript do build

Esta atualização corrige os dois erros reportados ao executar `npm run build`:

1. `src/App.tsx`: a chave de tradução dinâmica `cat.${k}` agora é tipada como `Key`, que é o conjunto de chaves conhecido pelo dicionário i18n.
2. `src/components/MapView.tsx`: o listener `error` deixa o TypeScript inferir o tipo de evento do MapLibre. O campo `error` é um `ErrorLike` do MapLibre e não precisa ser forçado a uma instância global `Error`.

Na raiz do projeto, reinstale as dependências e compile:

```powershell
npm install --include=dev
npm run build
```

Se `tsc` ainda não for encontrado, confirme se o TypeScript foi instalado localmente:

```powershell
npm ls typescript
Test-Path .\node_modules\.bin\tsc.cmd
```
