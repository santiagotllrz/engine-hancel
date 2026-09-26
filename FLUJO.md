flowchart TD
    %% ---- El recorrido de una noticia, con sus tiempos ----
    %% Cada paso es un agente con su modo, su horario y su prompt.
    %% Los tiempos son medidos, no estimados.

    subgraph ACC["Cuentas"]
        ent["👤 Entras"] --> acuenta{"¿A que cuenta<br/>entras?"}
        acuenta -->|Agro| a_agro["Agro<br/>sus temas y sus redes"]
        acuenta -->|Hancel| a_hancel["Hancel<br/>los suyos, aparte"]
        a_agro --> tools["🔧 Mismas herramientas de fondo<br/>Serper · Pexels · Claude · Buffer"]
        a_hancel --> tools
    end

    tools --> reloj

    subgraph SG0["⏱️ El reloj"]
        reloj["Tick cada 2 minutos<br/>una pasada = 33-43 s<br/>un trabajo por buzon"]
        reloj --> modos{"Cada agente:<br/>manual · programado · automatico"}
        modos --> nota0["Ritmo real:<br/>una pieza cada 2 min<br/>≈ 30 por hora"]
    end

    nota0 --> b_rel

    subgraph SG1["1 · Extraccion · Serper"]
        b_rel["⏰ 11:00 y 18:00<br/>manual o programado"] --> b_busca["Una consulta por segmento<br/>de la taxonomia"]
        b_busca --> b_rep{"¿Mismo enlace<br/>o mas de 5 dias?"}
        b_rep -->|Si| b_desc["🗑️ Fuera<br/>o a 'Por fecha'"]
        b_rep -->|No| b_ok["✅ En cola para analizar"]
    end

    b_ok --> an_web

    subgraph SG2["2 · Analisis · Claude Haiku"]
        an_web["🌐 Composio trae el material<br/>la IA no navega"] --> an_ia["Claude solo lee y puntua<br/>~1.000 tokens por noticia"]
        an_ia --> an_nota["Nota 1-10 + palabras clave<br/>+ por donde enfocarla"]
    end

    an_nota --> an_umbral

    subgraph SG3["3 · Angulo · Claude Sonnet"]
        an_umbral{"¿Supera el<br/>umbral de score?"}
        an_umbral -->|No| an_arch["😴 Archivada<br/>la puedes empujar a mano"]
        an_umbral -->|Si| rep{"¿Otro medio ya conto<br/>este mismo hecho?<br/>ventana de 7 dias"}
        rep -->|Si| rep_no["🗑️ 'Repetidas'<br/>gana el score mas alto"]
        rep -->|No| ang_ok["🎯 Un angulo<br/>la lectura no obvia"]
    end

    ang_ok --> w_ig
    ang_ok --> w_li

    subgraph SG4["4 · Contenido · una idea, varias redes"]
        w_ig["✍️ Instagram<br/>guion de 5 laminas<br/>~2.900 tokens"]
        w_li["✍️ LinkedIn<br/>post largo<br/>~2.100 tokens"]
        w_ig --> w_fb["✍️ Facebook<br/>del mismo guion<br/>0 llamadas extra"]
    end

    w_ig --> im_foto
    w_fb --> im_foto

    subgraph SG5["5 · Imagenes · ~18 s por carrusel"]
        im_foto["📷 Pexels: el fondo<br/>busquedas que escribe el agente"] --> im_elem["🔍 Serper: el elemento<br/>logo o producto, al azar<br/>entre las mas cuadradas"]
        im_elem --> im_dib["Dibuja 5 laminas + cierre"]
        im_dib --> im_ok["🖼️ 6 imagenes listas"]
    end

    w_li --> pub_modo
    im_ok --> pub_modo

    subgraph SG6["6 · Publicacion · un horario por canal"]
        pub_modo{"¿Como publica<br/>este canal?"}
        pub_modo -->|Manual| pub_boton["Boton o arrastrar<br/>en el estudio"]
        pub_modo -->|Programado| pub_tanda["A tus horas<br/>9:00, 9:20, 13:30...<br/>N piezas en cada una"]
        pub_modo -->|Automatico| pub_ya["En cuanto esta lista"]
        pub_boton --> pub_out["📤 LinkedIn · Instagram · Facebook"]
        pub_tanda --> pub_out
        pub_ya --> pub_out
    end

    subgraph FAIL["Si algo falla"]
        f_algo["⚠️ Falla un paso"] --> f_anota["Se anota el motivo<br/>y se ve en la ficha"]
        f_anota --> f_sigue["La pasada continua"]
        f_sigue --> f_retry["🔄 Reclamado vuelve a la cola<br/>a los 30 min"]
    end

    %% Cualquier paso puede fallar sin tumbar la pasada
    b_busca -.-> f_algo
    an_web -.-> f_algo
    im_dib -.-> f_algo
    pub_out -.-> f_algo

    classDef base fill:#111,color:#fff,stroke:#555;
    classDef ok fill:#0f2a1a,color:#fff,stroke:#2a6;
    classDef bad fill:#2a1414,color:#fff,stroke:#a44;
    classDef muted fill:#1a1a1a,color:#999,stroke:#444;
    classDef warn fill:#2a2414,color:#fff,stroke:#a84;
    classDef time fill:#14202a,color:#fff,stroke:#48a;

    class ent,acuenta,a_agro,a_hancel,b_rel,b_busca,b_rep,an_web,an_ia,an_nota,an_umbral,rep,ang_ok,w_li,w_ig,w_fb,im_foto,im_elem,im_dib,pub_modo,pub_boton,pub_tanda,pub_ya base;
    class b_ok,im_ok,pub_out,f_retry ok;
    class b_desc,rep_no bad;
    class an_arch,tools muted;
    class f_algo,f_anota,f_sigue warn;
    class reloj,modos,nota0 time;
