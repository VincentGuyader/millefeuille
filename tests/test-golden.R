# Golden master : le calcul R doit reproduire exactement le calcul JavaScript
# d'origine (tests/legacy), fige dans tests/fixtures.
# Lancer : Rscript -e 'testthat::test_dir("tests")'

library(testthat)
source(file.path(root, "plieur.R"))

fx_dir <- file.path(root, "tests", "fixtures")
glyphes <- jsonlite::fromJSON(file.path(fx_dir, "glyphes.json"), simplifyVector = FALSE)

as_glyph <- function(g) {
  rows <- unlist(g$rows)
  px <- as.integer(unlist(strsplit(rows, split = "")))
  list(px = as.raw(px), x0 = g$x0, x1 = g$x1, y0 = g$y0, y1 = g$y1)
}

read_case <- function(path) {
  jsonlite::fromJSON(path, simplifyVector = TRUE)
}

cases <- setdiff(list.files(fx_dir, pattern = "\\.json$"), c("glyphes.json", "nombres.json"))

for (f in cases) {
  fx <- read_case(file.path(fx_dir, f))
  test_that(paste("golden :", fx$name), {
    cfg <- fx$cfg
    res <- build(cfg, glyph = as_glyph(glyphes[[fx$glyph]]))
    expect_equal(res$sheets, fx$expected$sheets)
    exp_folds <- fx$expected$folds
    if (is.null(exp_folds) || length(exp_folds) == 0) {
      expect_equal(nrow(res$folds), 0)
    } else {
      expect_equal(res$folds$sheet, exp_folds$sheet)
      expect_identical(res$folds$a, as.numeric(exp_folds$a))
      expect_identical(res$folds$b, as.numeric(exp_folds$b))
    }
    expect_equal(res$stats$sheets, fx$expected$stats$sheets)
    expect_equal(res$stats$marks, fx$expected$stats$marks)
    expect_equal(res$stats$hours, fx$expected$stats$hours)
    expect_identical(make_csv(res$folds), fx$expected$csv)
    expect_identical(make_pdf(cfg, folds = res$folds), jsonlite::base64_dec(fx$expected$pdf_base64))
  })
}

test_that("to_fixed1 reproduit toFixed(1) de JavaScript", {
  nb <- jsonlite::fromJSON(file.path(fx_dir, "nombres.json"), simplifyVector = FALSE)
  x <- vapply(nb$fixed, FUN.VALUE = numeric(1), FUN = function(v) v[[1]])
  want <- vapply(nb$fixed, FUN.VALUE = numeric(1), FUN = function(v) v[[2]])
  want_txt <- vapply(nb$fixed, FUN.VALUE = character(1), FUN = function(v) v[[3]])
  got <- to_fixed1(x)
  bad <- which(got != want)
  expect_identical(got, want, info = paste("ecarts :", paste(head(x[bad]), collapse = ", ")))
  expect_identical(sprintf("%.1f", got), want_txt)
})

test_that("js_num reproduit String(x) de JavaScript", {
  nb <- jsonlite::fromJSON(file.path(fx_dir, "nombres.json"), simplifyVector = FALSE)
  x <- vapply(nb$strs, FUN.VALUE = numeric(1), FUN = function(v) v[[1]])
  want <- vapply(nb$strs, FUN.VALUE = character(1), FUN = function(v) v[[2]])
  got <- js_num(x)
  bad <- which(got != want)
  expect_identical(got, want, info = paste("ecarts :", paste(head(paste(got[bad], want[bad])), collapse = " | ")))
})

test_that("un mot vide laisse quand meme les vagues", {
  cfg <- list(np = 480, garde = 18, pas = 1, ang = 180, proj = "fan", ondul = "bloc",
              amp = 0.1, ampb = 0.08, thick = 0.06, mir = FALSE, cyc = 1,
              h = 205, mt = 20, mb = 20, minf = 5, gap = 4, tech = 3)
  res <- build(cfg, glyph = NULL)
  expect_gt(nrow(res$folds), 0)
  expect_equal(res$stats$sheets, res$sheets)
  res_na <- build(cfg, glyph = NA)
  expect_identical(res_na$folds, res$folds)
})

test_that("zero pli donne des colonnes numeriques, un CSV reduit a l'en-tete et un PDF d'une page", {
  folds <- mmf(matrix(FALSE, nrow = NR, ncol = 3), page_h = 205, mt = 20, mb = 20,
               min_fold = 5, gap = 4, max_marks = 1)
  expect_identical(sapply(folds, class), c(sheet = "integer", a = "numeric", b = "numeric"))
  expect_identical(make_csv(folds), "\ufefffeuille;repere_1;repere_2;repere_3;repere_4;repere_5;repere_6\n")
  pdf <- make_pdf(list(np = 480, h = 205, mt = 20, mb = 20, tech = 1, mot = "x"), folds = folds)
  expect_true(grepl("/Count 1 ", rawToChar(pdf), fixed = TRUE))
})
