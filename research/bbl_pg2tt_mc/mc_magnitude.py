"""
How large can the measured MC of a P(g2T-T)|BBL junction realistically be?

MC_device = MC_pair(J, k_sr, kS/kT) x D_reenc(q, Phi) x S_junction x f_pol,e x f_pol,h

* MC_pair : polaron-pair recombination-yield change at 100 mT, now with exchange J and
            spin relaxation k_sr (full Liouville-space solution, hyperfine-averaged).
* D_reenc : dilution by re-encounters; a pair that dissociates meets a new partner with
            probability q, so the junction transfer probability is Phi/(1 - q(1 - Phi)).
* S       : d ln I_D / d ln beta at the NDT peak from device.py (1 = recombination-limited).
* f_pol   : fraction of carriers that are spin-1/2 polarons (bipolarons are spinless and
            give no spin-selective pairs).

Priors are order-of-magnitude assumptions; the output is a plausibility range, not a prediction.
"""
import numpy as np
import matplotlib.pyplot as plt
from scipy.interpolate import RegularGridInterpolator
import device as d

GAMMA = 1.7609e8
sx = np.array([[0, 1], [1, 0]]) / 2
sy = np.array([[0, -1j], [1j, 0]]) / 2
sz = np.array([[1, 0], [0, -1]]) / 2
I2, I4 = np.eye(2), np.eye(4)
S1 = [np.kron(s, I2) for s in (sx, sy, sz)]
S2 = [np.kron(I2, s) for s in (sx, sy, sz)]
sing = np.array([0, 1, -1, 0]) / np.sqrt(2)
PS = np.outer(sing, sing).astype(complex)
PT = I4 - PS
S1S2 = sum(a @ b for a, b in zip(S1, S2))

rng = np.random.default_rng(1)
N = 1500
h_e = rng.normal(0, 0.5 / np.sqrt(3), (N, 3))
h_h = rng.normal(0, 1.0 / np.sqrt(3), (N, 3))


def spre(A):  return np.kron(I4, A)          # vec(A rho), column stacking
def spost(A): return np.kron(A.T, I4)        # vec(rho A)


# spin-relaxation superoperator: each spin depolarised at rate k_sr
D_relax = np.zeros((16, 16), complex)
for Sg in (S1, S2):
    for a in Sg:
        sig = 2 * a
        D_relax += 0.25 * np.kron(sig.T, sig)
    D_relax -= 0.75 * np.eye(16)


def phi_rec(B, J, ksr, kS, kT, kd=3e7):
    kS_, kT_, kd_, ksr_ = kS / GAMMA, kT / GAMMA, kd / GAMMA, ksr / GAMMA
    f1, f2 = h_e.copy(), h_h.copy()
    f1[:, 2] += B; f2[:, 2] += B
    H = sum(f1[:, i, None, None] * S1[i] + f2[:, i, None, None] * S2[i] for i in range(3))
    H = H - J * (2 * S1S2 + 0.5 * I4)
    K = kS_ * PS + kT_ * PT + kd_ * I4
    L = (-1j * np.stack([spre(h) - spost(h) for h in H])
         - 0.5 * (spre(K) + spost(K)) + ksr_ * D_relax)
    rho0 = (I4 / 4).reshape(-1, order="F")
    rint = np.linalg.solve(-L, np.broadcast_to(rho0, (N, 16))[..., None])[..., 0]
    rint = rint.reshape(N, 4, 4, order="F")
    Y = kS_ * np.einsum('ij,nji->n', PS, rint) + kT_ * np.einsum('ij,nji->n', PT, rint)
    return np.real(Y).mean()


def mc_pair(J, ksr, ratio, B=100.0, kS=1e8):
    p0 = phi_rec(0.0, J, ksr, kS, kS / ratio)
    return phi_rec(B, J, ksr, kS, kS / ratio) / p0 - 1, p0


# sanity check vs. previous script (J=0, no relaxation, ratio 10 -> about -8.9 %)
print("check:", mc_pair(1e-6, 1.0, 10))

Js = np.logspace(-2, 2, 5)            # mT  (0.01 mT ~ 1 neV ... 100 mT ~ 12 ueV)
ksrs = np.logspace(6, 10, 5)          # s^-1
ratios = np.array([3., 10., 30., 100.])
MC = np.zeros((len(Js), len(ksrs), len(ratios)))
PHI = np.zeros_like(MC)
for i, J in enumerate(Js):
    for j, k in enumerate(ksrs):
        for l, r in enumerate(ratios):
            MC[i, j, l], PHI[i, j, l] = mc_pair(J, k, r)
np.savez("mc_pair_grid.npz", Js=Js, ksrs=ksrs, ratios=ratios, MC=MC, PHI=PHI)
for j, k in enumerate(ksrs):
    print(f"k_sr={k:.0e}: MC_pair(r=10) vs J={Js} ->", np.round(MC[:, j, 1] * 100, 3), "%")

lg = (np.log10(Js), np.log10(ksrs), np.log10(ratios))
f_mc = RegularGridInterpolator(lg, MC)
f_phi = RegularGridInterpolator(lg, PHI)

# junction sensitivity S(zeta) at the NDT peak
VG = np.linspace(-0.2, 1.0, 121)
zetas = np.logspace(-13, -5, 17)
Sz = []
for z in zetas:
    I, _ = d.transfer(VG, -0.3, z)
    Sz.append(d.sensitivity(VG[I.argmax()], -0.3, z))
Sz = np.array(Sz)

# Monte Carlo over priors
M = 200000
pts = np.column_stack([rng.uniform(-2, 2, M), rng.uniform(6, 10, M), rng.uniform(np.log10(3), 2, M)])
mcp, phi = f_mc(pts), f_phi(pts)
q = rng.uniform(0.5, 0.99, M)
D = (1 - q) / (1 - q * (1 - phi))
fpol = (10 ** rng.uniform(np.log10(0.05), np.log10(0.5), (M, 2))).prod(axis=1)
S = np.interp(rng.uniform(-12, -6, M), np.log10(zetas), Sz)
best = np.abs(mcp * D * fpol)                      # S = 1 (recombination-limited)
full = best * S


def report(name, x):
    pc = np.percentile(x * 100, [5, 25, 50, 75, 95])
    print(f"{name}: |MC| percentiles 5/25/50/75/95 % = " + " / ".join(f"{v:.2g}" for v in pc)
          + f" | P(|MC|>1%)={np.mean(x > 0.01):.3f}  P(|MC|>0.1%)={np.mean(x > 1e-3):.3f}")


report("pair only          ", np.abs(mcp))
report("x re-encounter     ", np.abs(mcp * D))
report("x polaron fraction (S=1)", best)
print("median f_pol,e*f_pol,h =", np.median(fpol))
report("x junction S (prior)", full)

# --- plot ---
C = ["#2a78d6", "#eb6834", "#1baf7a"]
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#52514e", "xtick.color": "#52514e", "ytick.color": "#52514e"})
fig, ax = plt.subplots(1, 3, figsize=(15, 4.6), facecolor="#fcfcfb")
for a in ax:
    a.set_facecolor("#fcfcfb"); a.grid(color="#e4e3df", lw=0.6)
for c, i in zip(C, [0, 2, 4]):
    ax[0].semilogx(ksrs, np.abs(MC[i, :, 1]) * 100, "o-", color=c, lw=2, ms=6, label=f"J = {Js[i]:g} mT")
ax[0].set(xlabel="spin relaxation $k_{sr}$ (s$^{-1}$)", ylabel="|MC$_{pair}$| at 100 mT (%)",
          title="(a) Pair-level MC: exchange & spin relaxation ($k_S/k_T$=10)")
qq = np.linspace(0, 0.995, 200)
for c, ph in zip(C, [0.1, 0.3, 0.5]):
    ax[1].plot(qq, (1 - qq) / (1 - qq * (1 - ph)), color=c, lw=2, label=f"Φ$_{{rec}}$ = {ph}")
ax[1].set(xlabel="re-encounter probability q", ylabel="dilution factor $D$",
          title="(b) Re-encounter dilution of MC")
bins = np.logspace(-6, 2, 80)
ax[2].hist(np.abs(mcp) * 100, bins=bins, color=C[0], alpha=0.55, label="pair level")
ax[2].hist(best * 100, bins=bins, color=C[1], alpha=0.55, label="device, recombination-limited (S=1)")
ax[2].hist(full * 100, bins=bins, color=C[2], alpha=0.55, label="device, S from ζ prior")
ax[2].axvline(1, color="#52514e", ls="--", lw=1); ax[2].text(1.15, ax[2].get_ylim()[1] * 0.6, "1 %", color="#52514e")
ax[2].set(xscale="log", xlabel="|MC| at 100 mT (%)", ylabel="count", title="(c) Plausible MC range (Monte Carlo over priors)")
for a in ax:
    a.legend(frameon=False, fontsize=8.5)
fig.tight_layout()
fig.savefig("mc_magnitude.png", dpi=160, facecolor=fig.get_facecolor())
