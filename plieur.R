# Plieur : calcul du patron de pliage.
#
# Ce fichier est charge dans le navigateur par webR (R compile en WebAssembly).
# Il ne depend que de R de base. Le navigateur ne fait que deux choses autour :
# dessiner le mot dans une police (le glyphe, une matrice de pixels) et afficher
# le resultat. Tout le calcul est ici.
#
# Conventions :
# - une matrice d'encre a NR lignes (hauteur de la page, du haut vers le bas)
#   et une colonne par feuille pliee ;
# - les positions sont en millimetres depuis le haut de la page.

NR <- 200L

# Arrondis identiques a ceux de JavaScript : Math.round() arrondit les .5 vers
# le haut, toFixed(1) aussi quand la valeur tombe exactement sur un .x5.
js_round <- function(v) {
  f <- floor(v)
  f + (v - f >= 0.5)
}

to_fixed1 <- function(x) {
  if (length(x) == 0) {
    return(numeric(0))
  }
  tie <- (x * 4 == floor(x * 4)) & (x * 2 != floor(x * 2))
  out <- ifelse(tie, sign(x) * ceiling(abs(x) * 10) / 10, as.numeric(sprintf("%.1f", x)))
  out + 0
}

# Un nombre ecrit comme JavaScript l'ecrirait : le plus court texte qui
# redonne exactement la meme valeur. Prevu pour les grandeurs de la page
# (millimetres, points PDF, nombres de pages), pas pour les tres petits nombres.
# Le PDF repete quelques dizaines de valeurs des milliers de fois, d'ou le cache.
js_num_cache <- new.env(parent = emptyenv())

js_num <- function(x) {
  vapply(x, FUN.VALUE = character(1), FUN = function(v) {
    key <- sprintf("%a", v)
    hit <- js_num_cache[[key]]
    if (!is.null(hit)) {
      return(hit)
    }
    s <- NULL
    if (v == floor(v) && abs(v) < 1e21) {
      s <- sprintf("%.0f", v)
    } else {
      for (d in 1:17) {
        cand <- formatC(v, digits = d, format = "fg", decimal.mark = ".")
        if (as.numeric(cand) == v) {
          s <- cand
          break
        }
      }
      if (is.null(s)) {
        s <- formatC(v, digits = 17, format = "fg", decimal.mark = ".")
      }
    }
    assign(key, value = s, envir = js_num_cache)
    s
  })
}

# Position horizontale normalisee de chaque feuille, entre 0 et 1.
# Les feuilles d'un livre ouvert sont reparties uniformement en angle, pas en
# abscisse : leur position visible suit un sinus. Le mode "fan" corrige cet
# ecrasement des bords, le mode "linear" reproduit le defaut des patrons du commerce.
sample_u <- function(n, angle_deg, mode) {
  i <- (seq_len(n) - 0.5) / n
  if (mode == "linear" || angle_deg <= 0) {
    return(i)
  }
  a <- angle_deg * pi / 180
  phi <- -a / 2 + a * i
  (sin(phi) + sin(a / 2)) / (2 * sin(a / 2))
}

# Decalage vertical de chaque feuille pour faire onduler le mot.
wave <- function(n, amp, cycles) {
  if (amp <= 0) {
    return(rep(0, n))
  }
  k <- seq_len(n) - 1
  amp * sin(2 * pi * cycles * (k + 0.5) / n)
}

# Deux bandes pleines, en haut et en bas, dont l'axe suit une sinusoide.
# Renvoie une matrice logique NR x n.
ribbon <- function(n, amp, cycles, thick, mirror) {
  if (thick <= 0) {
    return(matrix(FALSE, nrow = NR, ncol = n))
  }
  base <- thick / 2 + amp
  half <- thick / 2
  j <- seq_len(n) - 1
  s <- sin(2 * pi * cycles * (j + 0.5) / n)
  ct <- base + amp * s
  flip <- if (mirror) {
    -s
  } else {
    s
  }
  cb <- 1 - base + amp * flip
  r <- (seq_len(NR) - 0.5) / NR
  abs(outer(r, ct, FUN = "-")) <= half | abs(outer(r, cb, FUN = "-")) <= half
}

# Projette le glyphe sur les feuilles.
# glyph : liste avec px (pixels 0/1 de la boite englobante, ligne par ligne),
# x0, x1, y0, y1 (boite englobante dans le canvas d'origine).
# u : abscisse normalisee de chaque feuille ; off : decalage vertical ;
# lo, hi : fenetre verticale occupee par le mot, entre 0 et 1.
project_glyph <- function(glyph, u, off, lo, hi) {
  n <- length(u)
  h <- glyph$y1 - glyph$y0 + 1
  w <- glyph$x1 - glyph$x0 + 1
  g <- matrix(as.integer(glyph$px), nrow = h, ncol = w, byrow = TRUE)
  x <- js_round(glyph$x0 + u * (glyph$x1 - glyph$x0))
  rv <- (seq_len(NR) - 0.5) / NR
  dv <- (outer(rv, off, FUN = "-") - lo) / (hi - lo)
  valid <- dv >= 0 & dv <= 1
  y <- js_round(glyph$y0 + dv * (glyph$y1 - glyph$y0))
  xj <- matrix(x, nrow = NR, ncol = n, byrow = TRUE)
  ink <- matrix(FALSE, nrow = NR, ncol = n)
  idx <- which(valid)
  ink[idx] <- g[cbind(y[idx] - glyph$y0 + 1, xj[idx] - glyph$x0 + 1)] == 1L
  ink
}

# Transforme la matrice d'encre en reperes : segments continus par colonne,
# fusion des segments trop proches, rejet des trop courts, plafonnement du
# nombre de bandes par feuille, conversion en millimetres.
mmf <- function(ink, page_h, mt, mb, min_fold, gap, max_marks) {
  usable <- page_h - mt - mb
  n <- ncol(ink)
  sheet <- integer(0)
  a_all <- numeric(0)
  b_all <- numeric(0)
  for (j in seq_len(n)) {
    r <- rle(ink[, j])
    ends <- cumsum(r$lengths)
    starts <- ends - r$lengths
    run0 <- starts[r$values]
    end0 <- ends[r$values]
    if (length(run0) == 0) {
      next
    }
    a <- mt + run0 / NR * usable
    b <- mt + end0 / NR * usable
    s_out <- a[1]
    e_out <- b[1]
    for (k in seq_along(a)[-1]) {
      last <- length(e_out)
      if (a[k] - e_out[last] < gap) {
        e_out[last] <- b[k]
      } else {
        s_out <- c(s_out, a[k])
        e_out <- c(e_out, b[k])
      }
    }
    len <- e_out - s_out
    keep <- len >= min_fold
    s_out <- s_out[keep]
    e_out <- e_out[keep]
    len <- len[keep]
    if (length(s_out) > max_marks) {
      chosen <- sort(order(-len, seq_along(len))[seq_len(max_marks)])
      s_out <- s_out[chosen]
      e_out <- e_out[chosen]
    }
    sheet <- c(sheet, rep(j, times = length(s_out)))
    a_all <- c(a_all, s_out)
    b_all <- c(b_all, e_out)
  }
  data.frame(sheet = sheet, a = to_fixed1(a_all), b = to_fixed1(b_all))
}

fold_stats <- function(folds) {
  used <- length(unique(folds$sheet))
  list(sheets = used, marks = 2L * nrow(folds), hours = max(1, js_round(used / 60)))
}

# Le pipeline complet. cfg est la liste des reglages de la page, glyph le mot
# dessine (NULL ou NA si le mot est vide ou ne contient aucune encre).
build <- function(cfg, glyph = NULL) {
  sheets <- max(1, floor((floor(cfg$np / 2) - 2 * cfg$garde) / cfg$pas))
  u <- sample_u(sheets, angle_deg = cfg$ang, mode = cfg$proj)
  word_moves <- cfg$ondul %in% c("mot", "deux")
  has_band <- cfg$ondul %in% c("bloc", "deux")
  amp_w <- if (word_moves) {
    cfg$amp
  } else {
    0
  }
  amp_b <- if (has_band) {
    cfg$ampb
  } else {
    0
  }
  thk <- if (has_band) {
    cfg$thick
  } else {
    0
  }
  off <- wave(sheets, amp = amp_w, cycles = cfg$cyc)
  band <- ribbon(sheets, amp = amp_b, cycles = cfg$cyc, thick = thk, mirror = isTRUE(cfg$mir))

  lo <- if (thk > 0) {
    thk + 2 * amp_b + 0.03 + amp_w
  } else {
    amp_w
  }
  hi <- 1 - lo
  if (hi - lo < 0.2) {
    lo <- 0.4
    hi <- 0.6
  }

  ink <- band
  if (is.list(glyph) && length(glyph$px) > 0) {
    ink <- band | project_glyph(glyph, u = u, off = off, lo = lo, hi = hi)
  }
  folds <- mmf(ink, page_h = cfg$h, mt = cfg$mt, mb = cfg$mb,
               min_fold = cfg$minf, gap = cfg$gap, max_marks = cfg$tech)
  list(sheets = sheets, folds = folds, stats = fold_stats(folds))
}

# Six cases par feuille : debut et fin de chaque bande, en texte, completees
# par des vides. Renvoie une matrice de texte, une ligne par feuille pliee,
# dont les noms de lignes sont les numeros de feuille.
cells_by_sheet <- function(folds) {
  sheets <- unique(folds$sheet)
  m <- matrix("", nrow = length(sheets), ncol = 6)
  rownames(m) <- as.character(sheets)
  if (nrow(folds) == 0) {
    return(m)
  }
  row <- match(folds$sheet, table = sheets)
  pos <- ave(seq_len(nrow(folds)), folds$sheet, FUN = seq_along)
  keep <- pos <= 3
  m[cbind(row[keep], 2 * pos[keep] - 1)] <- sprintf("%.1f", folds$a[keep])
  m[cbind(row[keep], 2 * pos[keep])] <- sprintf("%.1f", folds$b[keep])
  m
}

paste_cols <- function(m, sep) {
  do.call(paste, args = c(lapply(seq_len(ncol(m)), FUN = function(j) m[, j]), sep = sep))
}

# Une ligne de texte par feuille pliee : le numero, un separateur, les six cases.
# Attention a paste0, qui transforme une entree vide en une ligne vide.
sheet_lines <- function(cells, sep_num, sep_cells) {
  if (nrow(cells) == 0) {
    return(character(0))
  }
  paste0(rownames(cells), sep_num, paste_cols(cells, sep = sep_cells))
}

make_csv <- function(folds) {
  cells <- cells_by_sheet(folds)
  lines <- sheet_lines(cells, sep_num = ";", sep_cells = ";")
  body <- if (length(lines) == 0) {
    ""
  } else {
    paste0(lines, "\n", collapse = "")
  }
  paste0("\ufeff", "feuille;repere_1;repere_2;repere_3;repere_4;repere_5;repere_6\n", body)
}

# ---------- PDF ----------
# Ecrit a la main : objets, table xref, flux de contenu en BT/Tf/Td/Tj.
# A4, deux colonnes de 56 lignes, Courier pour les chiffres, Helvetica-Bold
# pour le titre, encodage WinAnsi. Tout caractere au-dela de 255 devient "?".

pdf_text <- function(s) {
  s <- gsub("([\\\\()])", "\\\\\\1", x = s)
  cp <- utf8ToInt(s)
  if (length(cp) == 0) {
    return(raw(0))
  }
  times <- ifelse(cp > 65535, 2L, 1L)
  cp[cp > 255] <- 63L
  as.raw(rep(cp, times = times))
}

pdf_line <- function(font, size, x, y, text) {
  c(charToRaw(sprintf("BT /%s %s Tf %s %s Td (", font, js_num(size), js_num(x), js_num(y))),
    pdf_text(text),
    charToRaw(") Tj ET\n"))
}

pad_start <- function(s, width) {
  formatC(s, width = width)
}

make_pdf <- function(cfg, folds) {
  W <- 595.28
  H <- 841.89
  ml <- 48
  mt <- 54
  cells <- cells_by_sheet(folds)
  padded <- cells
  padded[] <- pad_start(cells, width = 5)
  rownames(padded) <- pad_start(rownames(cells), width = 3)
  rows <- sheet_lines(padded, sep_num = "  ", sep_cells = " ")
  head <- paste0("Fl.  ", paste(pad_start(as.character(1:6), width = 5), collapse = " "))

  per_col <- 56
  per_page <- per_col * 2
  n_pages <- max(1, ceiling(length(rows) / per_page))
  pages <- lapply(seq_len(n_pages), FUN = function(p) {
    from <- (p - 1) * per_page + 1
    rows[seq(from, length.out = min(per_page, max(0, length(rows) - from + 1)))]
  })

  meta <- paste0(js_num(cfg$np), " pages  .  page de ", js_num(cfg$h), " mm  .  marges ",
                 js_num(cfg$mt), "/", js_num(cfg$mb), " mm  .  ",
                 if (cfg$tech == 1) {
                   "pliage simple"
                 } else {
                   "avec decoupe"
                 })

  contents <- lapply(seq_len(n_pages), FUN = function(p) {
    chunk <- pages[[p]]
    y0 <- H - mt - 52
    rh <- 11.6
    title <- if (is.null(cfg$mot)) {
      ""
    } else {
      cfg$mot
    }
    t <- c(pdf_line("F2", size = 17, x = ml, y = H - mt, text = title),
           pdf_line("F1", size = 8, x = ml, y = H - mt - 16, text = meta),
           pdf_line("F1", size = 8, x = ml, y = H - mt - 28,
                    text = paste0("Mesures en mm depuis le haut. Page ", p, "/", n_pages)))
    for (col in 0:1) {
      t <- c(t, pdf_line("F1", size = 8, x = ml + col * 252, y = y0 + 13, text = head))
    }
    k <- seq_along(chunk)
    col <- (k - 1) %/% per_col
    i <- (k - 1) %% per_col
    opens <- sprintf("BT /F1 8 Tf %s %s Td (", js_num(ml + col * 252), js_num(y0 - i * rh))
    close <- charToRaw(") Tj ET\n")
    lines <- lapply(k, FUN = function(kk) {
      c(charToRaw(opens[kk]), pdf_text(chunk[kk]), close)
    })
    c(t, unlist(lines))
  })

  objs <- vector("list", 4 + 2 * n_pages)
  kids <- paste(paste0(5 + (seq_len(n_pages) - 1) * 2, " 0 R"), collapse = " ")
  objs[[1]] <- charToRaw("<< /Type /Catalog /Pages 2 0 R >>")
  objs[[2]] <- charToRaw(paste0("<< /Type /Pages /Count ", n_pages, " /Kids [", kids, "] >>"))
  objs[[3]] <- charToRaw("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>")
  objs[[4]] <- charToRaw("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
  for (p in seq_len(n_pages)) {
    i <- p - 1
    objs[[5 + i * 2]] <- charToRaw(paste0(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ", sprintf("%.2f", W), " ", sprintf("%.2f", H),
      "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ", 6 + i * 2, " 0 R >>"))
    objs[[6 + i * 2]] <- c(charToRaw(paste0("<< /Length ", length(contents[[p]]), " >>\nstream\n")),
                           contents[[p]], charToRaw("endstream"))
  }

  parts <- list(charToRaw("%PDF-1.4\n"))
  total <- length(parts[[1]])
  offsets <- integer(length(objs))
  for (i in seq_along(objs)) {
    offsets[i] <- total
    piece <- c(charToRaw(paste0(i, " 0 obj\n")), objs[[i]], charToRaw("\nendobj\n"))
    parts[[length(parts) + 1]] <- piece
    total <- total + length(piece)
  }
  xref <- total
  tail <- paste0("xref\n0 ", length(objs) + 1, "\n0000000000 65535 f \n",
                 paste(sprintf("%010d 00000 n \n", offsets), collapse = ""),
                 "trailer\n<< /Size ", length(objs) + 1, " /Root 1 0 R >>\nstartxref\n", xref, "\n%%EOF")
  parts[[length(parts) + 1]] <- charToRaw(tail)
  unlist(parts)
}
