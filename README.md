# 🌎 GeoGus
### Monitoramento Global de Terremotos e Vulcões
**Global Earthquake & Volcano Monitoring**

<p align="center">
  <a href="https://geo-gus.vercel.app/">🌐 Acessar o GeoGus</a> ·
  <a href="https://github.com/luizgpoliveira/GeoGus">💻 Repositório GitHub</a>
</p>

**Um projeto independente que conecta tecnologia, geologia e vulcanologia.**  
**An independent project connecting technology, geology and volcanology.**

---

# 🇧🇷 PORTUGUÊS

## 🌋 Sobre o projeto

O **GeoGus** é uma plataforma independente de visualização e acompanhamento de informações públicas sobre terremotos, vulcões e atividades geológicas ao redor do mundo.

O projeto nasceu do desejo de utilizar a tecnologia para aproximar informações científicas das pessoas, reunindo diferentes fontes de dados em uma interface geográfica interativa.

Por meio de um mapa global, o GeoGus permite explorar vulcões, acompanhar eventos sísmicos, consultar atualizações de observatórios e visualizar informações relacionadas à atividade geológica.

Mais do que uma ferramenta tecnológica, o GeoGus representa a união entre programação e uma paixão pessoal pela compreensão do nosso planeta.

## 🎯 Objetivos

- Centralizar informações públicas sobre terremotos e vulcões.
- Facilitar a visualização geográfica de eventos geológicos.
- Aproximar tecnologia, ciência e divulgação científica.
- Tornar informações de diferentes instituições mais acessíveis.
- Incentivar o interesse pelo estudo da geologia, sismologia e vulcanologia.

## 🗺️ Principais funcionalidades

### 🌋 Monitoramento vulcânico
- Catálogo global de vulcões.
- Identificação de vulcões ativos e estruturas históricas.
- Mapeamento de supervulcões.
- Visualização de atualizações e boletins de observatórios.
- Classificação visual experimental da atividade vulcânica.
- Histórico de atividade e informações disponíveis sobre os vulcões.

### 🌎 Monitoramento sísmico
- Visualização global de terremotos.
- Informações de magnitude, profundidade, localização e horário.
- Filtros por período e magnitude.
- Agrupamento de eventos sísmicos no mapa.
- Integração de diferentes fontes públicas de dados.

### 🛰️ Visualização geográfica
- Mapa global interativo.
- Integração de MapLibre GL JS e Leaflet.
- Marcadores personalizados para vulcões e terremotos.
- Animações para eventos recentes e sinais de atividade.
- Diferentes níveis de visualização e filtros geográficos.

### 🔔 Alertas e notificações
- Indicadores visuais de atividade.
- Destaque para eventos relevantes.
- Notificações de eventos monitorados, conforme disponibilidade das integrações.
- Recursos de aplicação web progressiva (PWA).

## 🚦 Classificação visual da atividade vulcânica

O GeoGus utiliza uma classificação visual experimental para facilitar a identificação de diferentes condições de atividade:

| Cor | Classificação | Significado |
|---|---|---|
| 🟢 | Normal | Nenhum sinal elevado identificado nas fontes consultadas |
| 🟡 | Aviso | Sinais de inquietação ou atividade acima do padrão |
| 🟠 | Atenção | Aumento relevante da atividade ou atividade eruptiva preocupante |
| 🔴 | Perigo | Evidências de atividade eruptiva significativa ou alerta oficial elevado |

A classificação considera informações disponíveis em boletins, atualizações de observatórios e outras fontes públicas.

**Importante:** essas cores são indicadores visuais experimentais do GeoGus. Não representam uma escala oficial universal e não substituem os níveis de alerta publicados pelos observatórios responsáveis.

## 🔬 Fontes de dados científicos

O projeto utiliza informações públicas provenientes de diferentes instituições e serviços científicos.

Entre as fontes e referências utilizadas estão:

- **USGS — United States Geological Survey:** dados e informações sísmicas e vulcânicas.
- **Smithsonian Global Volcanism Program (GVP):** catálogo e histórico de atividade vulcânica.
- **PHIVOLCS — Philippine Institute of Volcanology and Seismology:** informações sísmicas e vulcânicas das Filipinas.
- **PVMBG — Center for Volcanology and Geological Hazard Mitigation:** informações sobre atividade vulcânica na Indonésia.
- **Centro de Sismologia da USP:** informações e referências de sismicidade brasileira.
- **Rede Sismográfica Brasileira (RSBR):** dados e informações sísmicas do Brasil.

A disponibilidade, frequência de atualização, cobertura geográfica e precisão dos dados dependem de cada instituição e serviço de origem.

Sempre que possível, as informações devem ser consultadas diretamente em suas fontes oficiais.

## 🛠️ Tecnologias utilizadas

O GeoGus é desenvolvido com tecnologias modernas para aplicações web e visualização geográfica:

- React
- TypeScript
- Vite
- MapLibre GL JS
- Leaflet
- JavaScript
- CSS
- Vercel

## 🚀 Executando localmente

### Requisitos
- Node.js
- npm
- Git

### Clonar o repositório

```bash
git clone https://github.com/luizgpoliveira/GeoGus.git
cd GeoGus
```

### Instalar dependências

```bash
npm install
```

### Executar em desenvolvimento

```bash
npm run dev
```

### Executar os testes de precisão

```bash
npm run test:precisao
```

### Gerar a versão de produção

```bash
npm run build
```

Algumas integrações podem depender de variáveis de ambiente ou configurações específicas de seus respectivos provedores.

Nunca compartilhe chaves privadas, tokens ou credenciais no repositório público.

## ⚠️ Responsabilidade científica e limitações

O GeoGus é um projeto independente de software, visualização e organização de informações geológicas.

A plataforma:

- Não é um observatório científico oficial.
- Não substitui sistemas institucionais de monitoramento.
- Não prevê terremotos ou erupções vulcânicas.
- Não deve ser utilizada isoladamente para decisões de segurança ou emergência.
- Depende da disponibilidade, qualidade e atualização das fontes externas.

As classificações e indicadores visuais são experimentais e podem apresentar limitações decorrentes da cobertura dos dados e das metodologias utilizadas.

Para decisões de segurança, emergências e avaliações científicas, consulte sempre os órgãos oficiais responsáveis.

## 👨‍💻 Sobre o idealizador

Meu nome é **Luiz Gustavo de Paula Oliveira**, sou desenvolvedor de software brasileiro.

Sou apaixonado por geologia e vulcanologia desde os 10 anos de idade. Embora minha carreira profissional esteja atualmente na área de desenvolvimento de software, nunca deixei de acompanhar, ler e estudar sobre o nosso planeta, principalmente os vulcões, terremotos e os fenômenos geológicos.

O GeoGus nasceu dessa paixão.

Decidi utilizar meus conhecimentos em programação para construir uma ferramenta que reunisse informações científicas públicas e permitisse explorar melhor os fenômenos que sempre despertaram minha curiosidade.

Ainda não sou vulcanólogo ou pesquisador da área. Um dos meus grandes sonhos é me aproximar cada vez mais da comunidade científica e, futuramente, seguir o caminho da vulcanologia.

Acredito que a tecnologia pode ser uma ponte entre pessoas, conhecimento e ciência. O GeoGus é uma maneira de transformar esse interesse em algo concreto, continuar aprendendo e, quem sabe, contribuir futuramente com a comunidade que estuda o nosso planeta.

## 🤝 Colaboração e contato

O GeoGus está em constante desenvolvimento.

Sugestões, críticas construtivas, referências científicas e contribuições técnicas são muito bem-vindas.

Tenho especial interesse em receber contribuições de:

- Vulcanólogos e sismólogos.
- Geólogos e geofísicos.
- Pesquisadores e estudantes universitários.
- Desenvolvedores interessados em ciência e geotecnologia.

**Idealizador:** Luiz Gustavo de Paula Oliveira  
**Localização:** Brasil  
**Área profissional:** Desenvolvimento de Software  
**Projeto:** GeoGus

🌐 Plataforma: https://geo-gus.vercel.app/  
💻 GitHub: https://github.com/luizgpoliveira/GeoGus

---

# 🇺🇸 ENGLISH

## 🌋 About the Project

**GeoGus** is an independent platform focused on the visualization and exploration of publicly available information about earthquakes, volcanoes, and geological activity around the world.

The project was created with the idea of using technology to make scientific information more accessible, bringing together data from different sources in an interactive geographical interface.

Through a global map, GeoGus allows users to explore volcanoes, follow seismic events, consult observatory updates, and visualize information related to geological activity.

More than a software application, GeoGus represents the connection between programming and a personal passion for understanding our planet.

## 🎯 Project Goals

- Bring publicly available earthquake and volcano information together.
- Improve the geographical visualization of geological events.
- Connect technology, science, and science communication.
- Make information from different institutions easier to explore.
- Encourage interest in geology, seismology, and volcanology.

## 🗺️ Main Features

### 🌋 Volcano Monitoring
- Global volcano catalogue.
- Identification of active volcanoes and historical volcanic structures.
- Supervolcano mapping.
- Observatory bulletins and activity updates.
- Experimental visual classification of volcanic activity.
- Available historical and activity information.

### 🌎 Earthquake Monitoring
- Global earthquake visualization.
- Magnitude, depth, location, and occurrence time.
- Time and magnitude filters.
- Seismic event clustering.
- Integration of multiple public data sources.

### 🛰️ Geospatial Visualization
- Interactive global map.
- MapLibre GL JS and Leaflet integration.
- Custom volcano and earthquake markers.
- Animations for recent events and activity indicators.
- Geographic filters and map exploration.

### 🔔 Alerts and Notifications
- Visual activity indicators.
- Highlighting of relevant events.
- Notifications for monitored events, depending on available integrations.
- Progressive Web App (PWA) capabilities.

## 🚦 Volcanic Activity Classification

GeoGus uses an experimental visual classification to help users identify different volcanic activity conditions:

| Color | Classification | Meaning |
|---|---|---|
| 🟢 | Normal | No elevated signals identified in the consulted sources |
| 🟡 | Advisory | Signs of unrest or activity above normal conditions |
| 🟠 | Watch | Relevant increase in activity or concerning eruptive activity |
| 🔴 | Danger | Evidence of significant eruptive activity or an elevated official alert |

The classification considers information available in observatory bulletins, official updates, and other public sources.

**Important:** These colors are experimental GeoGus visual indicators. They are not a universal official alert scale and must not replace the alert levels published by responsible observatories.

## 🔬 Scientific Data Sources

The project uses publicly available information from different scientific institutions and data services.

Sources and references include:

- **USGS — United States Geological Survey:** seismic and volcanic information.
- **Smithsonian Global Volcanism Program (GVP):** global volcano catalogue and historical activity.
- **PHIVOLCS — Philippine Institute of Volcanology and Seismology:** seismic and volcanic information from the Philippines.
- **PVMBG — Center for Volcanology and Geological Hazard Mitigation:** volcanic activity information from Indonesia.
- **University of São Paulo Seismology Center:** Brazilian seismic information and references.
- **Brazilian Seismographic Network (RSBR):** seismic data and information from Brazil.

Data availability, update frequency, geographic coverage, and accuracy depend on each institution and original data service.

Whenever possible, information should be checked against its original official source.

## 🛠️ Technology Stack

GeoGus is developed using modern web technologies for application development and geospatial visualization:

- React
- TypeScript
- Vite
- MapLibre GL JS
- Leaflet
- JavaScript
- CSS
- Vercel

## 🚀 Running Locally

### Requirements
- Node.js
- npm
- Git

### Clone the repository

```bash
git clone https://github.com/luizgpoliveira/GeoGus.git
cd GeoGus
```

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

### Run precision tests

```bash
npm run test:precisao
```

### Build for production

```bash
npm run build
```

Some integrations may require environment variables or provider-specific configuration.

Never expose private keys, access tokens, or credentials in the public repository.

## ⚠️ Scientific Responsibility and Limitations

GeoGus is an independent software, visualization, and geological information project.

The platform:

- Is not an official scientific observatory.
- Does not replace institutional monitoring systems.
- Does not predict earthquakes or volcanic eruptions.
- Should not be used as the sole source for safety or emergency decisions.
- Depends on the availability, quality, and update frequency of external data sources.

Its visual classifications and indicators are experimental and may have limitations related to data coverage and the methodologies used.

For safety decisions, emergencies, and scientific assessments, always consult the responsible official authorities.

## 👨‍💻 About the Creator

My name is **Luiz Gustavo de Paula Oliveira**, and I am a software developer from Brazil.

I have been passionate about geology and volcanology since I was 10 years old. Although my professional career is currently in software development, I have never stopped reading, learning, and following information about our planet, especially volcanoes, earthquakes, and geological phenomena.

GeoGus was born from this passion.

I decided to use my programming skills to build a tool that brings publicly available scientific information together and makes it easier to explore the natural phenomena that have always fascinated me.

I am not a professional volcanologist or a researcher in this field. One of my greatest personal dreams is to get closer to the scientific community and, in the future, pursue a path in volcanology.

I believe technology can serve as a bridge between people, knowledge, and science. GeoGus is my way of turning this interest into something tangible, continuing to learn, and hopefully contributing to the community that studies our planet.

## 🤝 Collaboration and Contact

GeoGus is continuously evolving.

Constructive feedback, scientific references, technical recommendations, and contributions are welcome.

I am particularly interested in hearing from:

- Volcanologists and seismologists.
- Geologists and geophysicists.
- Researchers and university students.
- Developers interested in science and geospatial technology.

**Creator:** Luiz Gustavo de Paula Oliveira  
**Location:** Brazil  
**Professional Field:** Software Development  
**Project:** GeoGus

🌐 Platform: https://geo-gus.vercel.app/  
💻 GitHub: https://github.com/luizgpoliveira/GeoGus

---

*Built with curiosity, technology, and a lifelong passion for understanding our planet.*

*Desenvolvido com curiosidade, tecnologia e uma paixão de longa data por compreender o nosso planeta.*
