CURL=curl

FISHTANK_ASSETS=fishstrip.png background-flip2.jpg
FISHTANK_ASSETS_FP=$(FISHTANK_ASSETS:%=examples/fishtank/%)

fishtank:   $(FISHTANK_ASSETS_FP)

examples/fishtank/%:
	$(CURL) -o $@ http://ie.microsoft.com/testdrive/Performance/FishIETank/$*

.PHONY: fishtank

