"""Expected engine failures. HTTP status mapping lives in the server."""


class BrandForwardError(Exception):
    """Base class for failures the server knows how to answer."""


class UnknownFixture(BrandForwardError):
    """The requested fixture id is not in the local catalog."""


class JobNotFound(BrandForwardError):
    """No persisted job matches the id."""


class ProposalNotFound(BrandForwardError):
    """The job has no proposal with that id."""


class ReceiptNotFound(BrandForwardError):
    """The job has no receipt to verify."""


class RenderBlocked(BrandForwardError):
    """FFmpeg render refused because a clear receipt is missing or stale."""


class ProxyLeakage(BrandForwardError):
    """The proxy failed the local export guard."""

    def __init__(self, problems: list) -> None:
        self.problems = list(problems)
        super().__init__("proxy export blocked")


class MediaError(BrandForwardError):
    """A local media step failed and the fallback could not finish it."""


class PlanInvalid(BrandForwardError):
    """A planner answered outside the edit-plan schema."""


class NotFound(BrandForwardError):
    """A frame, media file, or egress record does not exist for this job."""
