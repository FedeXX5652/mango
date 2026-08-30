class DomainError(Exception):
    """Una regla de dominio fue violada (algo que la base no impone sola).

    La capa de ruta la traduce a HTTP 422. Vive aca para reusarse entre recursos.
    """
