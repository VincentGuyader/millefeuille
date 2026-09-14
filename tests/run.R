# Lance tous les tests depuis la racine du depot : Rscript tests/run.R
root <- normalizePath(".")
stopifnot(file.exists(file.path(root, "millefeuille.R")))
testthat::test_dir(file.path(root, "tests"), env = list2env(list(root = root)), stop_on_failure = TRUE)
