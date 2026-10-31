"""NDT (anti-ambipolar peak) of the P(g2T-T)|BBL junction vs interfacial recombination rate."""
import numpy as np
import matplotlib.pyplot as plt
import device as d

VD = -0.3
VG = np.linspace(-0.2, 1.0, 241)
cases = [(1e-6, "channel-limited (ζ = 1e-6)"),
         (1e-9, "mixed (ζ = 1e-9)"),
         (1e-11, "recombination-limited (ζ = 1e-11)")]
C = ["#2a78d6", "#eb6834", "#1baf7a"]

res = {}
for z, lab in cases:
    I, fj = d.transfer(VG, VD, z)
    k = I.argmax()
    S = np.array([d.sensitivity(v, VD, z) for v in VG])
    VDs = -np.logspace(-3, 0, 40)
    Iout = np.array([d.solve_current(VG[k], v, z) for v in VDs])
    res[z] = (I, fj, S, VDs, Iout)
    print(f"{lab}: I_peak={I[k]:.2e} A @ VG={VG[k]:.2f} V | PVR(I_pk/I(1.0V))={I[k]/I[-1]:.1e} | "
          f"FWHM={np.ptp(VG[I > I[k]/2]):.2f} V | V_j/V_D={fj[k]:.2f} | dlnI/dlnβ={S[k]:.2f}")

plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#52514e", "xtick.color": "#52514e", "ytick.color": "#52514e"})
fig, ax = plt.subplots(2, 2, figsize=(11, 8.2), facecolor="#fcfcfb")
for a in ax.flat:
    a.set_facecolor("#fcfcfb"); a.grid(color="#e4e3df", lw=0.6)
for c, (z, lab) in zip(C, cases):
    I, fj, S, VDs, Iout = res[z]
    ax[0, 0].semilogy(VG, I, color=c, lw=2, label=lab)
    ax[0, 1].plot(VG, I / I.max(), color=c, lw=2, label=lab)
    ax[1, 0].plot(VG, S, color=c, lw=2, label=lab)
    ax[1, 1].loglog(-VDs, Iout / Iout[-1], color=c, lw=2, label=lab)
ax[0, 0].set(xlabel="$V_G$ (V)", ylabel="$|I_D|$ (A)", title=f"(a) Transfer curves, $V_D$ = {VD} V", ylim=(1e-14, 1e-5))
ax[0, 1].set(xlabel="$V_G$ (V)", ylabel="$I_D/I_{D,peak}$", title="(b) Normalized: peak position & width")
ax[1, 0].set(xlabel="$V_G$ (V)", ylabel="d ln $I_D$ / d ln β",
             title="(c) Sensitivity of $I_D$ to recombination rate")
ax[1, 1].set(xlabel="$|V_D|$ (V)", ylabel="$I_D/I_D(|V_D|$=1 V)", title="(d) Output curve at each peak $V_G$")
for a in ax.flat:
    a.legend(frameon=False, fontsize=8.5)
fig.tight_layout()
fig.savefig("ndt_recombination.png", dpi=160, facecolor=fig.get_facecolor())
