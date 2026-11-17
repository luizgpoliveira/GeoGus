# Correção TypeScript — Leaflet MapOptions

Foi removida a propriedade `tap: true` das opções passadas a `L.map()` em `src/components/MapView.tsx`.

A propriedade `tap` não faz parte do tipo `MapOptions` disponibilizado pelas definições do Leaflet usadas pelo projeto. A opção `touchZoom: true` foi mantida, assim como os demais controles de navegação por toque.

## Validação local

Execute na raiz do projeto:

```powershell
npm ci
npm run build
```

Na cópia usada para preparar esta correção, `npm run build` não completou porque a pasta `node_modules` disponível estava incompleta e não continha várias definições de tipos (`@types/*`). Isso é um problema do ambiente de dependências, não um novo erro apontado em `MapView.tsx`. O `npm ci` reinstala as dependências de acordo com `package-lock.json`.
