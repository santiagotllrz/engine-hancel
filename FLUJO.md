flowchart TD
    %% ---- Un solo diagrama con todo el flujo ----
    %% Todo pasa dentro de una cuenta; las cuentas comparten las herramientas.

    subgraph ACC["Cuentas"]
        ent["👤 Entras"] --> acuenta{"¿A que cuenta<br/>entras?"}
        acuenta -->|Agro| a_agro["Agro<br/>sus temas y sus redes"]
        acuenta -->|Hancel| a_hancel["Hancel<br/>los suyos, aparte"]
        a_agro --> tools["🔧 Mismas herramientas de fondo<br/>Serper · fotos · Claude · Buffer"]
        a_hancel --> tools
    end

    tools --> b_rel

    subgraph SG1["1 · Buscar noticias"]
        b_rel["⏰ Tres veces al dia"] --> b_busca["Busca un tema tras otro"]
        b_busca --> b_rep{"¿Repetida o<br/>ya la teniamos?"}
        b_rep -->|Si| b_desc["🗑️ Descarta"]
        b_rep -->|No| b_ok["✅ Lista para analizar"]
    end

    b_ok --> an_lee

    subgraph SG2["2 · Analizar y puntuar"]
        an_lee["Lee el articulo completo,<br/>no solo el titular"] --> an_nota["Nota 1–10 + de que va<br/>y por donde enfocarla"]
        an_nota --> an_umbral{"¿Supera tu<br/>nota minima?"}
        an_umbral -->|No| an_arch["😴 Archivada, nunca se borra"]
        an_umbral -->|Si| an_ok["✅ Pasa a contenido"]
    end

    an_ok --> ang_enf

    subgraph SG3["3 · Elegir el angulo (una sola vez)"]
        ang_enf["Enfoque: que tiene de interesante"] --> ang_tesis["Una idea propia, discutible"]
        ang_tesis --> ang_fmt["Formato: dato, contradiccion, caso..."]
        ang_fmt --> ang_ok["🎯 Un angulo"]
    end

    ang_ok --> w_li
    ang_ok --> w_ig
    ang_ok --> w_fb

    subgraph SG4["4 · Escribir: una idea, varias redes"]
        w_li["✍️ Post de LinkedIn<br/>gancho, parrafos cortos, cierre"]
        w_ig["✍️ Carrusel de Instagram<br/>una idea por lamina"]
        w_fb["✍️ Facebook<br/>del mismo guion del carrusel"]
    end

    w_ig --> im_foto
    w_fb --> im_foto

    subgraph SG5["5 · Preparar imagenes"]
        im_foto["Busca fotos del otro lado del tema,<br/>no lo obvio"] --> im_dib["Dibuja portada, laminas y cierre"]
        im_dib --> im_ok["🖼️ Listas para publicar"]
    end

    w_li --> pub_modo
    im_ok --> pub_modo

    subgraph SG6["6 · Publicar"]
        pub_modo{"¿Como<br/>publicas?"}
        pub_modo -->|A mano| pub_boton["Boton cuando quieras"]
        pub_modo -->|Automatico| pub_tanda["Por tandas, a tus horas"]
        pub_boton --> pub_out["📤 Publicado en<br/>LinkedIn · Instagram · Facebook"]
        pub_tanda --> pub_out
    end

    subgraph FAIL["Si algo falla"]
        f_algo["⚠️ Falla un paso"] --> f_anota["Se anota el motivo"]
        f_anota --> f_sigue["El resto continua"]
        f_sigue --> f_retry["🔄 Reintentas cuando quieras"]
    end

    %% Cualquier paso puede fallar sin tumbar la pasada
    b_busca -.-> f_algo
    an_lee -.-> f_algo
    im_dib -.-> f_algo
    pub_out -.-> f_algo

    classDef base fill:#111,color:#fff,stroke:#555;
    classDef ok fill:#0f2a1a,color:#fff,stroke:#2a6;
    classDef bad fill:#2a1414,color:#fff,stroke:#a44;
    classDef muted fill:#1a1a1a,color:#999,stroke:#444;
    classDef warn fill:#2a2414,color:#fff,stroke:#a84;

    class ent,acuenta,a_agro,a_hancel,b_rel,b_busca,b_rep,an_lee,an_nota,an_umbral,ang_enf,ang_tesis,ang_fmt,w_li,w_ig,w_fb,im_foto,im_dib,pub_modo,pub_boton,pub_tanda base;
    class b_ok,an_ok,ang_ok,im_ok,pub_out,f_retry ok;
    class b_desc bad;
    class an_arch,tools muted;
    class f_algo,f_anota,f_sigue warn;
